import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'

const CODE128_TEXT = /^[\x20-\x7E]+$/

// Código de barras Code128 en SVG (se imprime nítido a cualquier tamaño).
export function Barcode({ value, label }: { value: string; label: string }) {
  const ref = useRef<SVGSVGElement>(null)
  // Code128 solo admite caracteres ASCII imprimibles (sin tildes ni ñ).
  const supported = CODE128_TEXT.test(value)

  useEffect(() => {
    if (ref.current && supported) {
      JsBarcode(ref.current, value, { format: 'CODE128', height: 40, width: 1.6, margin: 0, displayValue: false })
    }
  }, [value, supported])

  if (!supported) return <p className="font-mono text-sm">{value}</p>
  return <svg ref={ref} role="img" aria-label={label} className="h-auto max-w-full" />
}

export function QrCode({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then((markup) => {
      if (active) setSvg(markup)
    })
    return () => {
      active = false
    }
  }, [value])

  // El SVG lo genera la librería a partir del SKU; no contiene datos del usuario sin escapar.
  return <div role="img" aria-label={label} className="size-20 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
}
