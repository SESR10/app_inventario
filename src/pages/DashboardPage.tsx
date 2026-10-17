import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'

export function DashboardPage() {
  const { t } = useTranslation()
  const { current } = useCompany()

  return (
    <section className="flex flex-col gap-4">
      <PageHeading title={t('dashboard.title')}>{t('dashboard.title')}</PageHeading>
      <p>{t('dashboard.welcome', { company: current?.company.name })}</p>
      {current && <p className="text-muted">{t(`roles.${current.role}`)}</p>}
      <p className="text-muted">{t('dashboard.nextSteps')}</p>
    </section>
  )
}
