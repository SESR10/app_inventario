import type { DecodeHintType as HintType } from '@zxing/library'

// Lectura de códigos con la cámara. Usa el lector que trae el navegador (BarcodeDetector, en Android y
// Chrome) y, si no lo tiene (iPhone, Firefox), una librería que se descarga solo en ese caso.

export interface CodeReader {
  read(video: HTMLVideoElement): Promise<string | null>
}

// Formatos de las etiquetas de la app (Code128 y QR) y los de fábrica más comunes (EAN, UPC).
const FORMATS = ['code_128', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'itf']

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

async function nativeReader(): Promise<CodeReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (!Detector) return null
  try {
    const supported = await Detector.getSupportedFormats()
    const formats = FORMATS.filter((f) => supported.includes(f))
    if (!formats.includes('code_128') || !formats.includes('qr_code')) return null
    const detector = new Detector({ formats })
    return {
      read: async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null,
    }
  } catch {
    return null
  }
}

// Se analiza una copia reducida del cuadro: más rápido y suficiente para leer una etiqueta.
const MAX_WIDTH = 720

async function libraryReader(): Promise<CodeReader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map<HintType, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ],
    ],
  ])
  const reader = new BrowserMultiFormatReader(hints)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return {
    read: async (video) => {
      const { videoWidth: width, videoHeight: height } = video
      if (!width || !context) return null
      const scale = Math.min(1, MAX_WIDTH / width)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        return reader.decodeFromCanvas(canvas).getText()
      } catch {
        return null
      }
    },
  }
}

let readerPromise: Promise<CodeReader> | null = null

export function getCodeReader() {
  readerPromise ??= nativeReader().then((native) => native ?? libraryReader())
  return readerPromise
}

export type CameraProblem = 'denied' | 'missing' | 'insecure' | 'busy' | 'other'

// Cámara trasera del celular (en computador, la que haya).
export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw cameraProblem('insecure')
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') throw cameraProblem('denied')
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw cameraProblem('missing')
    if (name === 'NotReadableError' || name === 'AbortError') throw cameraProblem('busy')
    throw cameraProblem('other')
  }
}

function cameraProblem(kind: CameraProblem) {
  return Object.assign(new Error(kind), { kind })
}

export const problemOf = (error: unknown): CameraProblem =>
  (error as { kind?: CameraProblem }).kind ?? 'other'

// Linterna: solo algunos celulares la ofrecen desde el navegador.
export function torchOf(stream: MediaStream) {
  const track = stream.getVideoTracks()[0]
  const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
  if (!track || !capabilities.torch) return null
  return (on: boolean) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
}

let audio: AudioContext | null = null

// Aviso de lectura: vibración corta y un pitido suave.
export function signalRead() {
  navigator.vibrate?.(60)
  try {
    audio ??= new AudioContext()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = 1320
    gain.gain.setValueAtTime(0.12, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.12)
  } catch {
    // Sin sonido no pasa nada: la vibración y el texto ya avisan.
  }
}
