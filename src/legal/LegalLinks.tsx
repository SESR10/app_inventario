import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LEGAL_PATHS } from './config'

// Enlaces a los documentos legales (pie de página). newTab: para no perder un formulario a medio llenar.
export function LegalLinks({ newTab = false, className = '' }: { newTab?: boolean; className?: string }) {
  const { t } = useTranslation()
  const target = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <nav aria-label={t('legal.footerLabel')} className={`print:hidden ${className}`}>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
        {(Object.keys(LEGAL_PATHS) as (keyof typeof LEGAL_PATHS)[]).map((doc) => (
          <li key={doc}>
            <Link
              to={LEGAL_PATHS[doc]}
              {...target}
              className="inline-flex min-h-11 items-center text-muted underline underline-offset-4 hover:text-ink"
            >
              {t(`legal.links.${doc}`)}
              {newTab && <span className="sr-only"> {t('legal.newTab')}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
