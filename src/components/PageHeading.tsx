import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Título de página: actualiza document.title y recibe el foco al navegar,
// para que lectores de pantalla anuncien la nueva página.
export function PageHeading({ children, title, className = '' }: { children: ReactNode; title: string; className?: string }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`
    ref.current?.focus()
  }, [title, t])

  return (
    <h1 ref={ref} tabIndex={-1} className={`text-2xl font-extrabold tracking-tight text-brand-950 focus:outline-none sm:text-3xl ${className}`}>
      {children}
    </h1>
  )
}
