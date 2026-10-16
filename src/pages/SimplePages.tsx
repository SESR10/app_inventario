import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'

// Secciones que se construyen en fases siguientes.
export function PendingPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  const title = t(titleKey)
  return (
    <section className="flex flex-col gap-4">
      <PageHeading title={title}>{title}</PageHeading>
      <p className="text-muted">{t('pending.body')}</p>
    </section>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-4">
      <PageHeading title={t('notFound.title')}>{t('notFound.title')}</PageHeading>
      <Link to="/" className="text-brand-700 underline">
        {t('notFound.back')}
      </Link>
    </section>
  )
}
