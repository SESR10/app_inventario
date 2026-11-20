import { useTranslation } from 'react-i18next'

// Marca STOCK 360: un anillo de 360° con flecha (el inventario siempre al día, en todo el ciclo)
// alrededor de una caja. Dibujado a mano en SVG; decorativo, el nombre va en texto al lado.
export function LogoMark({ className = 'size-10' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className={`shrink-0 ${className}`}>
      <path
        d="M40.45 14.5A19 19 0 1 1 27.3 5.29"
        fill="none"
        stroke="var(--color-accent-400)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path d="M33.6 6.4 25.4 1.2l.9 9.6Z" fill="var(--color-accent-400)" />
      <path d="M24 13.5 33.5 18.3 24 23.1 14.5 18.3Z" fill="var(--color-accent-400)" />
      <path
        d="M14.5 18.3v10.4L24 33.5l9.5-4.8V18.3M24 23.1v10.4"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Nombre de la marca: "STOCK" en blanco y "360" en ámbar. Se lee completo en lectores de pantalla.
export function Logo({ wordClassName = '', className = '' }: { wordClassName?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className={`text-xl font-extrabold tracking-tight text-ink ${wordClassName}`}>
        <span className="sr-only">{t('app.name')}</span>
        <span aria-hidden="true">
          STOCK<span className="text-accent-400">360</span>
        </span>
      </span>
    </span>
  )
}
