import { ArrowLeftRight, CircleDollarSign, Package, PackageX, Tag, TriangleAlert, type LucideIcon } from 'lucide-react'
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
// Color de cada tarjeta del resumen (fondo del ícono / ícono).
const TONES = {
  brand: 'bg-brand-100 text-brand-700',
  amber: 'bg-accent-200 text-amber-800',
  red: 'bg-red-100 text-danger',
  green: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
}

interface Stat {
  label: string
  value: string
  icon: LucideIcon
  tone: keyof typeof TONES
  href?: string
  alert?: boolean
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
      icon: Package,
      tone: 'brand',
      href: '/productos',
    },
    {
      label: t('dashboard.lowStock'),
      value: formatNumber(Number(s.low_stock)),
      icon: TriangleAlert,
      tone: 'amber',
      href: '/productos?bajo=1',
      alert: s.low_stock > 0,
    },
    {
      label: t('dashboard.outOfStock'),
      value: formatNumber(Number(s.out_of_stock)),
      icon: PackageX,
      tone: 'red',
      alert: s.out_of_stock > 0,
    },
    {
      label: t('dashboard.stockCost'),
      value: formatMoney(Number(s.stock_cost)),
      icon: CircleDollarSign,
      tone: 'green',
    },
    {
      label: t('dashboard.stockPrice'),
      value: formatMoney(Number(s.stock_price)),
      icon: Tag,
      tone: 'sky',
    },
    {
      label: t('dashboard.movements7d'),
      value: formatNumber(Number(s.movements_7d)),
      icon: ArrowLeftRight,
      tone: 'violet',
      href: '/movimientos',
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-5 py-6 text-white shadow-lg shadow-brand-900/20 sm:px-8 sm:py-8">
        <HeroBoxes />
        <div className="relative flex max-w-xl flex-col gap-2">
          <p className="font-semibold text-accent-300">{t('dashboard.greeting')}</p>
          <PageHeading title={title} className="text-white">
            {t('dashboard.welcome', { company: current?.company.name })}
          </PageHeading>
          <p className="text-brand-100">{t('dashboard.heroText')}</p>
          {canEdit(current?.role) && (
            <nav
              aria-label={t('dashboard.quickActions')}
              className="mt-3 flex flex-wrap gap-3 [&_*:focus-visible]:outline-accent-300"
            >
              <LinkButton to="/movimientos/nuevo" variant="accent">
                {t('movements.record')}
              </LinkButton>
              <LinkButton
                to="/productos/nuevo"
                className="border border-white/40 bg-white/10 text-white hover:bg-white/20"
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
                className="relative flex min-h-20 flex-col-reverse justify-center gap-0.5 rounded-xl border border-line bg-white py-4 pr-4 pl-20 shadow-sm"
              >
                <dt className="text-sm font-medium text-muted">
                  {/* Ícono decorativo: dentro del término para que la lista siga siendo válida. */}
                  <span
                    className={`absolute top-1/2 left-4 grid size-12 -translate-y-1/2 place-items-center rounded-xl ${TONES[stat.tone]}`}
                  >
                    <stat.icon aria-hidden="true" className="size-6" />
                  </span>
                  {stat.href ? (
                    <Link to={stat.href} className="underline-offset-2 hover:underline">
                      {stat.label}
                    </Link>
                  ) : (
                    stat.label
                  )}
                </dt>
                <dd
                  className={`truncate text-2xl font-extrabold tabular-nums ${stat.alert ? 'text-danger' : 'text-brand-950'}`}
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
                <Link to="/productos?bajo=1" className="text-brand-700 underline">
                  {t('dashboard.seeAll')}
                </Link>
              )}
            </div>
            {data.low.length === 0 ? (
              <p className="text-muted">{t('dashboard.lowStockNone')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-sm">
                {data.low.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2">
                    <Link
                      to={`/productos/${p.id}`}
                      className="font-medium text-brand-700 underline-offset-2 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="text-sm font-medium text-danger">
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

// Cajas apiladas de adorno en el encabezado del panel.
function HeroBoxes() {
  const box = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M20 4 35 12 20 20 5 12Z" fill="#fbbf24" />
      <path d="M5 12 20 20v16L5 28Z" fill="#818cf8" />
      <path d="M35 12 20 20v16l15-8Z" fill="#6366f1" />
    </g>
  )
  return (
    <svg
      viewBox="0 0 200 160"
      aria-hidden="true"
      className="pointer-events-none absolute -right-6 -bottom-6 hidden w-72 opacity-90 xl:block"
    >
      {box(40, 70, 2)}
      {box(100, 70, 2)}
      {box(70, 25, 2)}
      {box(140, 100, 1.2)}
    </svg>
  )
}
