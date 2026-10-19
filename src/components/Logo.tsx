import { useTranslation } from 'react-i18next'

// Caja de bodega con cinta: el símbolo de la app. Decorativo: el nombre va en texto al lado.
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <path d="M20 4 35 12 20 20 5 12Z" fill="#fbbf24" />
      <path d="M5 12 20 20v16L5 28Z" fill="#6366f1" />
      <path d="M35 12 20 20v16l15-8Z" fill="#4338ca" />
      <path d="M12.5 8 27.5 16v8" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ wordClassName = 'text-brand-950', className = '' }: { wordClassName?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className={`text-xl font-extrabold tracking-tight ${wordClassName}`}>
        {t('app.name')}
      </span>
    </span>
  )
}
