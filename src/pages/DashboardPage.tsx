import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { LinkButton } from '../components/ui/Button'
import { useSupabase } from '../lib/client-context'
import { formatMoney, formatNumber } from '../lib/format'
import { canEdit, type Movement, type ProductRow } from '../lib/types'
import { emptyMovementFilters, listMovements } from '../movements/api'
import { MovementList } from '../movements/MovementList'
import { emptyFilters, searchProducts } from '../products/api'

interface Summary {
  products: number
  low_stock: number
  out_of_stock: number
  stock_cost: number
  stock_price: number
  movements_7d: number
}

interface Data {
  summary: Summary
  low: ProductRow[]
  recent: Movement[]
}

const LOW_SHOWN = 10
const RECENT_SHOWN = 5

export function DashboardPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      client.rpc('dashboard_summary', { p_company: companyId }).then(({ data, error }) => {
        if (error) throw error
        return data as Summary
      }),
      searchProducts(client, companyId, { ...emptyFilters, lowStock: true }, null),
      listMovements(client, companyId, emptyMovementFilters, null),
    ])
      .then(([summary, low, recent]) => setData({ summary, low: low.slice(0, LOW_SHOWN), recent: recent.slice(0, RECENT_SHOWN) }))
      .catch(() => setError(true))
  }, [client, companyId])

  const title = t('dashboard.title')
  const s = data?.summary
  const stats = s && [
    { label: t('dashboard.products'), value: formatNumber(Number(s.products)) },
    { label: t('dashboard.lowStock'), value: formatNumber(Number(s.low_stock)), href: '/productos?bajo=1', alert: s.low_stock > 0 },
    { label: t('dashboard.outOfStock'), value: formatNumber(Number(s.out_of_stock)), alert: s.out_of_stock > 0 },
    { label: t('dashboard.stockCost'), value: formatMoney(Number(s.stock_cost)) },
    { label: t('dashboard.stockPrice'), value: formatMoney(Number(s.stock_price)) },
    { label: t('dashboard.movements7d'), value: formatNumber(Number(s.movements_7d)), href: '/movimientos' },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading title={title}>{title}</PageHeading>
        <p className="text-muted">{t('dashboard.welcome', { company: current?.company.name })}</p>
      </div>

      {error && <Alert tone="error">{t('dashboard.loadError')}</Alert>}
      {!data && !error && <p role="status">{t('app.loading')}</p>}

      {s && s.low_stock > 0 && (
        <Alert>
          <span className="font-medium">{t('dashboard.lowStockAlert', { count: Number(s.low_stock) })}</span>{' '}
          <Link to="/productos?bajo=1" className="underline">
            {t('dashboard.seeLowStock')}
          </Link>
        </Alert>
      )}

      {canEdit(current?.role) && (
        <nav aria-label={t('dashboard.quickActions')} className="flex flex-wrap gap-3">
          <LinkButton to="/movimientos/nuevo">{t('movements.record')}</LinkButton>
          <LinkButton to="/productos/nuevo" variant="secondary">
            {t('products.new')}
          </LinkButton>
        </nav>
      )}

      {stats && (
        <section aria-label={t('dashboard.statsLabel')}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse gap-1 rounded-lg border border-line bg-white p-4">
                <dt className="text-sm text-muted">
                  {stat.href ? (
                    <Link to={stat.href} className="underline-offset-2 hover:underline">
                      {stat.label}
                    </Link>
                  ) : (
                    stat.label
                  )}
                </dt>
                <dd className={`text-2xl font-bold tabular-nums ${stat.alert ? 'text-danger' : ''}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="reponer-titulo" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="reponer-titulo" className="text-xl font-semibold">
                {t('dashboard.lowStockTitle')}
              </h2>
              {data.low.length > 0 && (
                <Link to="/productos?bajo=1" className="text-brand-700 underline">
                  {t('dashboard.seeAll')}
                </Link>
              )}
            </div>
            {data.low.length === 0 ? (
              <p className="text-muted">{t('dashboard.lowStockNone')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                {data.low.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2">
                    <Link to={`/productos/${p.id}`} className="font-medium text-brand-700 underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-sm font-medium text-danger">
                      {t('dashboard.stockOf', { stock: formatNumber(p.stock), min: formatNumber(p.min_stock), unit: p.unit })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recientes-titulo" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="recientes-titulo" className="text-xl font-semibold">
                {t('dashboard.recentTitle')}
              </h2>
              {data.recent.length > 0 && (
                <Link to="/movimientos" className="text-brand-700 underline">
                  {t('dashboard.seeAll')}
                </Link>
              )}
            </div>
            {data.recent.length === 0 ? (
              <p className="text-muted">{t('dashboard.recentNone')}</p>
            ) : (
              <MovementList rows={data.recent} label={t('dashboard.recentTitle')} />
            )}
          </section>
        </div>
      )}
    </section>
  )
}
