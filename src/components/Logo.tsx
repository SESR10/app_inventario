import { useTranslation } from 'react-i18next'
import { sectionImages } from '../assets/secciones'

// Foto de una caja de bodega: el símbolo de la app. Decorativa: el nombre va en texto al lado.
export function LogoMark({ className = 'size-10' }: { className?: string }) {
  return <img src={sectionImages.caja} alt="" width={40} height={40} className={`rounded-xl object-cover ${className}`} />
}

export function Logo({ wordClassName = 'text-ink', className = '' }: { wordClassName?: string; className?: string }) {
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
