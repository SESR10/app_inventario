import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber } from '../lib/format'
import { canEdit } from '../lib/types'
import { lookupCode, type ScannedProduct } from './api'
import { getCodeReader, openCamera, problemOf, signalRead, torchOf, type CameraProblem } from './camera'
import { ScanResult } from './ScanResult'

type Camera =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'on'; stream: MediaStream }
  | { state: 'error'; problem: CameraProblem }

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; code: string }
  | { state: 'found'; code: string; data: ScannedProduct }
  | { state: 'missing'; code: string }
  | { state: 'error'; code: string }

// Pausa entre análisis de cuadros: lee en menos de un segundo sin recalentar el celular.
const READ_INTERVAL_MS = 90
const RECENT_MAX = 5

// Recuadro de mira: cuatro esquinas dibujadas a mano, no un ícono de librería.
function Viewfinder() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-[12%] size-[76%]">
      {['M0 18V3a3 3 0 0 1 3-3h15', 'M82 0h15a3 3 0 0 1 3 3v15', 'M100 82v15a3 3 0 0 1-3 3H82', 'M18 100H3a3 3 0 0 1-3-3V82'].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--color-accent-400)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export function ScanPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id
  const editable = canEdit(current?.role)

  const [camera, setCamera] = useState<Camera>({ state: 'off' })
  // Mientras se muestra un producto, la cámara sigue abierta pero no lee (para volver al instante).
  const [reading, setReading] = useState(false)
  const [torch, setTorch] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [manual, setManual] = useState('')
  const [recent, setRecent] = useState<{ code: string; name: string; sku: string }[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)
  const lookupId = useRef(0)

  const stream = camera.state === 'on' ? camera.stream : null
  const setTorchOn = stream ? torchOf(stream) : null

  // Conecta la cámara al video y la apaga al salir de la página.
  useEffect(() => {
    if (!stream) return
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      void video.play().catch(() => {})
    }
    return () => stream.getTracks().forEach((track) => track.stop())
  }, [stream])

  async function search(raw: string) {
    const code = raw.trim()
    if (!code) return
    const id = ++lookupId.current
    setReading(false)
    setLookup({ state: 'loading', code })
    try {
      const data = await lookupCode(client, companyId, code)
      if (id !== lookupId.current) return
      if (!data) return setLookup({ state: 'missing', code })
      setLookup({ state: 'found', code, data })
      setRecent((list) => [
        { code, name: data.product.name, sku: data.product.sku },
        ...list.filter((r) => r.code !== code),
      ].slice(0, RECENT_MAX))
    } catch {
      if (id === lookupId.current) setLookup({ state: 'error', code })
    }
  }

  // Analiza cuadros del video hasta encontrar un código.
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  })
  useEffect(() => {
    const video = videoRef.current
    if (!stream || !reading || !video) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    void getCodeReader().then((reader) => {
      const tick = async () => {
        if (stopped) return
        const code = video.readyState >= 2 ? await reader.read(video) : null
        if (stopped) return
        if (code) {
          signalRead()
          void searchRef.current(code)
        } else timer = setTimeout(tick, READ_INTERVAL_MS)
      }
      void tick()
    })
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [stream, reading])

  // Al encontrar un producto, el foco va a su nombre para que el lector de pantalla lo lea.
  useEffect(() => {
    if (lookup.state === 'found') resultRef.current?.focus()
  }, [lookup])

  async function start() {
    setCamera({ state: 'starting' })
    try {
      const opened = await openCamera()
      setCamera({ state: 'on', stream: opened })
      setTorch(false)
      setReading(true)
      // Prepara el lector mientras el usuario apunta.
      void getCodeReader()
    } catch (error) {
      setCamera({ state: 'error', problem: problemOf(error) })
    }
  }

  function again() {
    setLookup({ state: 'idle' })
    if (stream) {
      void videoRef.current?.play().catch(() => {})
      setReading(true)
    } else void start()
  }

  function stop() {
    setReading(false)
    setCamera({ state: 'off' })
  }

  async function toggleTorch() {
    if (!setTorchOn) return
    await setTorchOn(!torch).catch(() => {})
    setTorch(!torch)
  }

  function onManual(event: FormEvent) {
    event.preventDefault()
    void search(manual)
    setManual('')
  }

  const showing = lookup.state !== 'idle'
  const status =
    lookup.state === 'loading'
      ? t('scan.searching', { code: lookup.code })
      : lookup.state === 'found'
        ? t('scan.found', {
            name: lookup.data.product.name,
            stock: formatNumber(lookup.data.product.stock),
            unit: lookup.data.product.is_kit ? t('movements.kitsUnit') : lookup.data.product.unit,
          })
        : lookup.state === 'missing'
          ? t('scan.notFound', { code: lookup.code })
          : camera.state === 'starting'
            ? t('scan.starting')
            : ''

  return (
    <div className="flex flex-col gap-5">
      <div>
        <PageHeading title={t('scan.title')}>{t('scan.title')}</PageHeading>
        <p className="mt-1 max-w-2xl text-muted">{t('scan.intro')}</p>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section aria-label={t('scan.camera')} className={showing ? 'max-md:hidden' : undefined}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-black">
              {stream && (
                <video
                  ref={videoRef}
                  aria-hidden="true"
                  muted
                  playsInline
                  className={`size-full object-cover transition-opacity ${reading ? '' : 'opacity-40'}`}
                />
              )}
              <Viewfinder />
              {stream && reading && (
                <div aria-hidden="true" className="animate-scanline absolute inset-x-[14%] top-[14%] h-0.5 rounded bg-accent-400/90" />
              )}

              {!stream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  {camera.state === 'error' ? (
                    <>
                      <p className="max-w-xs text-ink">{t(`scan.problems.${camera.problem}`)}</p>
                      <Button onClick={() => void start()}>{t('scan.retry')}</Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => void start()} busy={camera.state === 'starting'} className="min-h-12 px-6 text-lg">
                        {camera.state === 'starting' ? t('scan.starting') : t('scan.start')}
                      </Button>
                      <p className="max-w-xs text-sm text-muted">{t('scan.startHint')}</p>
                    </>
                  )}
                </div>
              )}

              {stream && !reading && showing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button onClick={again} className="min-h-12 px-6 text-lg">
                    {t('scan.again')}
                  </Button>
                </div>
              )}
            </div>

            {stream && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">{reading ? t('scan.scanning') : ''}</p>
                <div className="flex gap-2">
                  {setTorchOn && (
                    <Button variant="secondary" aria-pressed={torch} onClick={() => void toggleTorch()}>
                      {torch ? t('scan.torchOff') : t('scan.torchOn')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={stop}>
                    {t('scan.stop')}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <form onSubmit={onManual} className="flex items-end gap-2" noValidate>
            <TextField
              name="code"
              label={t('scan.manual')}
              hint={t('scan.manualHint')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="search"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" className="mb-px">
              {t('scan.search')}
            </Button>
          </form>

          {recent.length > 0 && (
            <section aria-labelledby="escaneados-recientes">
              <h2 id="escaneados-recientes" className="mb-2 text-sm font-bold text-muted">
                {t('scan.recent')}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => void search(r.code)}
                      className="inline-flex min-h-11 max-w-60 flex-col items-start justify-center rounded-xl border border-line bg-surface px-3 py-1 text-left hover:border-slate-500"
                    >
                      <span className="w-full truncate text-sm font-semibold text-ink">{r.name}</span>
                      <span className="font-mono text-xs text-muted">{r.sku}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* En el celular el producto va primero, justo debajo del título. */}
        <div className="flex flex-col gap-3 max-md:order-first">
          {showing && lookup.state !== 'loading' && (
            <Button onClick={again} className="min-h-12 text-lg md:hidden">
              {t('scan.again')}
            </Button>
          )}
          {lookup.state === 'idle' && (
            <p className="rounded-2xl border border-dashed border-slate-500 p-6 text-center text-muted max-md:hidden">
              {t('scan.empty')}
            </p>
          )}
          {lookup.state === 'loading' && (
            <div aria-hidden="true" className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />
          )}
          {lookup.state === 'found' && <ScanResult ref={resultRef} data={lookup.data} editable={editable} />}
          {lookup.state === 'missing' && (
            <Alert tone="info">
              <p className="font-semibold">{t('scan.notFound', { code: lookup.code })}</p>
              <p>{t('scan.notFoundHint')}</p>
              {editable && (
                <LinkButton to={`/productos/nuevo?sku=${encodeURIComponent(lookup.code)}`} variant="secondary" className="mt-3">
                  {t('scan.create')}
                </LinkButton>
              )}
            </Alert>
          )}
          {lookup.state === 'error' && <Alert tone="error">{t('scan.error')}</Alert>}
        </div>
      </div>
    </div>
  )
}
