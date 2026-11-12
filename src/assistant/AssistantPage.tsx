import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { canEdit } from '../lib/types'
import { AssistantChat } from './AssistantChat'
import { OrdersPanel } from './OrdersPanel'

export function AssistantPage() {
  const { t } = useTranslation()
  const { current } = useCompany()
  const companyId = current!.company.id
  const [reloadKey, setReloadKey] = useState(0)
  const title = t('assistant.title')

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <PageHeading title={title}>{title}</PageHeading>
        <p className="max-w-3xl text-muted">{t('assistant.intro')}</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AssistantChat companyId={companyId} onOrderCreated={() => setReloadKey((n) => n + 1)} />
        <OrdersPanel companyId={companyId} canEdit={canEdit(current?.role)} reloadKey={reloadKey} />
      </div>
    </section>
  )
}
