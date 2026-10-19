import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'

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
