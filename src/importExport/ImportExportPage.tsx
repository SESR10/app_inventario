import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../lib/client-context'
import { canEdit } from '../lib/types'
import { exportAll } from './api'
import { FIELDS } from './fields'
import { ImportWizard } from './ImportWizard'
import { downloadWorkbook, today, type Cell } from './sheet'

const COLUMN_WIDTHS = [14, 40, 20, 12, 12, 12, 10, 14, 20, 24]

export function ImportExportPage() {
  const { t } = useTranslation()
  const { current } = useCompany()
  const title = t('importExport.title')

  return (
    <section className="flex flex-col gap-6">
      <PageHeading title={title}>{title}</PageHeading>
      <div className="grid gap-4 md:grid-cols-2">
        <ExportCard />
        <TemplateCard />
      </div>
      <section aria-labelledby="importar-titulo" className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 sm:p-6">
        <h2 id="importar-titulo" className="text-xl font-semibold">
          {t('importExport.importTitle')}
        </h2>
        {canEdit(current?.role) ? <ImportWizard /> : <Alert>{t('importExport.viewerNote')}</Alert>}
      </section>
    </section>
  )
}

function Card({ id, title, body, children }: { id: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 sm:p-6">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <p className="text-muted">{body}</p>
      {children}
    </section>
  )
}

function ExportCard() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const [state, setState] = useState<{ busy: boolean; count: number; done: boolean; error: boolean }>({
    busy: false,
    count: 0,
    done: false,
    error: false,
  })

  async function handleExport() {
    setState({ busy: true, count: 0, done: false, error: false })
    try {
      const rows = await exportAll(client, current!.company.id, (count) => setState((s) => ({ ...s, count })))
      const header = FIELDS.map((f) => t(`importExport.columns.${f}`))
      const body: Cell[][] = rows.map((r) => [
        r.sku, r.name, r.category, r.unit, r.cost, r.price, r.stock, r.min_stock, r.location, r.supplier,
      ])
      await downloadWorkbook(`${t('importExport.files.products')}-${today()}.xlsx`, [
        { name: t('importExport.files.productsSheet'), rows: [header, ...body], widths: COLUMN_WIDTHS },
      ])
      setState({ busy: false, count: rows.length, done: true, error: false })
    } catch {
      setState({ busy: false, count: 0, done: false, error: true })
    }
  }

  return (
    <Card id="exportar-titulo" title={t('importExport.exportTitle')} body={t('importExport.exportBody')}>
      <Button onClick={handleExport} busy={state.busy} className="self-start">
        {t('importExport.exportButton')}
      </Button>
      <div aria-live="polite">
        {state.busy && <p>{t('importExport.exporting', { count: state.count })}</p>}
        {state.done && <Alert tone="success">{t('importExport.exported', { count: state.count })}</Alert>}
      </div>
      {state.error && <Alert tone="error">{t('importExport.exportError')}</Alert>}
    </Card>
  )
}

function TemplateCard() {
  const { t } = useTranslation()

  function handleTemplate() {
    const header = FIELDS.map((f) => t(`importExport.columns.${f}`))
    const ex = (key: string) => t(`importExport.example.${key}`)
    const example: Cell[] = ['', ex('name'), ex('category'), ex('unit'), 18000, 25000, 10, 3, ex('location'), ex('supplier')]
    const instructions = (t('importExport.instructions', { returnObjects: true }) as string[]).map((line) => [line])
    void downloadWorkbook(`${t('importExport.files.template')}.xlsx`, [
      { name: t('importExport.files.productsSheet'), rows: [header, example], widths: COLUMN_WIDTHS },
      { name: t('importExport.files.instructionsSheet'), rows: instructions, widths: [110] },
    ])
  }

  return (
    <Card id="plantilla-titulo" title={t('importExport.templateTitle')} body={t('importExport.templateBody')}>
      <Button variant="secondary" onClick={handleTemplate} className="self-start">
        {t('importExport.templateButton')}
      </Button>
    </Card>
  )
}
