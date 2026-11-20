import { useId } from 'react'
import { useTranslation } from 'react-i18next'

// Símbolo de la app: una etiqueta de bodega con su código de barras calado (las barras y el ojal
// dejan ver el fondo). Dibujado a mano en SVG, sin íconos de librería. Decorativo: el nombre va al lado.
export function LogoMark({ className = 'size-10' }: { className?: string }) {
  const maskId = useId()
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className={`shrink-0 ${className}`}>
      <mask id={maskId}>
        <path d="M17.5 8H40a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H17.5a3 3 0 0 1-2.3-1.1L5 26.6a4 4 0 0 1 0-5.2l10.2-12.3A3 3 0 0 1 17.5 8Z" fill="#fff" />
        <circle cx="13.2" cy="24" r="2.6" fill="#000" />
        <g fill="#000">
          <rect x="20" y="15" width="3.2" height="18" rx=".6" />
          <rect x="25.2" y="15" width="1.4" height="18" rx=".5" />
          <rect x="28.6" y="15" width="4.2" height="18" rx=".6" />
          <rect x="34.8" y="15" width="1.4" height="13" rx=".5" />
          <rect x="38.2" y="15" width="2.4" height="13" rx=".6" />
        </g>
      </mask>
      <rect width="48" height="48" fill="var(--color-accent-400)" mask={`url(#${maskId})`} />
    </svg>
  )
}

export function Logo({ wordClassName = 'text-ink', className = '' }: { wordClassName?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className={`text-xl font-extrabold tracking-tight ${wordClassName}`}>{t('app.name')}</span>
    </span>
  )
}
