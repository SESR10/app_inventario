import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { sectionImages } from '../assets/secciones'
import { SectionIcon, type IconName } from '../components/SectionIcon'
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
interface Stat {
  label: string
  value: string
  icon: IconName
  href?: string
}
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
      .then(([summary, low, recent]) =>
        setData({
          summary,
          low: low.slice(0, LOW_SHOWN),
          recent: recent.slice(0, RECENT_SHOWN),
        }),
      )
      .catch(() => setError(true))
  }, [client, companyId])

  const title = t('dashboard.title')
  const s = data?.summary
  const stats: Stat[] | undefined = s && [
    {
      label: t('dashboard.products'),
      value: formatNumber(Number(s.products)),
      icon: 'products',
      href: '/productos',
    },
    {
      label: t('dashboard.lowStock'),
      value: formatNumber(Number(s.low_stock)),
      icon: 'low',
      href: '/productos?bajo=1',
    },
    {
      label: t('dashboard.outOfStock'),
      value: formatNumber(Number(s.out_of_stock)),
      icon: 'out',
    },
    {
      label: t('dashboard.stockCost'),
      value: formatMoney(Number(s.stock_cost)),
      icon: 'cost',
    },
    {
      label: t('dashboard.stockPrice'),
      value: formatMoney(Number(s.stock_price)),
      icon: 'price',
    },
    {
      label: t('dashboard.movements7d'),
      value: formatNumber(Number(s.movements_7d)),
      icon: 'week',
      href: '/movimientos',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-brand-950 px-5 py-7 text-white sm:px-10 sm:py-9">
        {/* Foto de bodega de fondo, oscurecida hacia la izquierda para que el texto se lea. */}
        <img
          src={sectionImages.bodega}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover object-right"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-brand-950 via-brand-950/80 to-brand-950/10" />
        <div className="relative flex max-w-xl flex-col gap-2">
          <p className="w-fit rounded-full bg-accent-200 px-3 py-1 text-sm font-semibold text-ink">
            {t('dashboard.greeting')}
          </p>
          <PageHeading title={title} className="text-white">
            {t('dashboard.welcome', { company: current?.company.name })}
          </PageHeading>
          <p className="text-ink/85">{t('dashboard.heroText')}</p>
          {canEdit(current?.role) && (
            <nav
              aria-label={t('dashboard.quickActions')}
              className="mt-3 flex flex-wrap gap-3"
            >
              <LinkButton to="/movimientos/nuevo" variant="accent">
                {t('movements.record')}
              </LinkButton>
              <LinkButton
                to="/productos/nuevo"
                variant="secondary"
              >
                {t('products.new')}
              </LinkButton>
            </nav>
          )}
        </div>
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

      {stats && (
        <section aria-label={t('dashboard.statsLabel')}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="relative flex min-h-24 flex-col justify-center gap-1 rounded-2xl border border-line bg-surface py-4 pr-4 pl-24 shadow-sm transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
              >
                <dt className="text-base font-semibold text-ink">
                  {/* Ícono decorativo: dentro del término para que la lista siga siendo válida. */}
                  <SectionIcon name={stat.icon} className="absolute top-1/2 left-4 size-16 -translate-y-1/2" />
                  {stat.href ? (
                    <Link to={stat.href} className="underline-offset-2 hover:underline">
                      {stat.label}
                    </Link>
                  ) : (
                    stat.label
                  )}
                </dt>
                <dd
                  className="truncate text-2xl font-bold text-ink tabular-nums"
                >
                  {stat.value}
                </dd>
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
                <Link to="/productos?bajo=1" className="text-ink underline">
                  {t('dashboard.seeAll')}
                </Link>
              )}
            </div>
            {data.low.length === 0 ? (
              <p className="text-muted">{t('dashboard.lowStockNone')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
                {data.low.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2">
                    <Link
                      to={`/productos/${p.id}`}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="text-sm text-ink">
                      {t('dashboard.stockOf', {
                        stock: formatNumber(p.stock),
                        min: formatNumber(p.min_stock),
                        unit: p.unit,
                      })}
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
                <Link to="/movimientos" className="text-ink underline">
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
