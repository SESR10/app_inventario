import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { sectionImages, type SectionImage } from '../assets/secciones'
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
// Color de cada tarjeta del resumen: franja de arriba y cifra.
const TONES = {
  brand: { bar: 'border-t-sky-700', text: 'text-sky-700' },
  amber: { bar: 'border-t-accent-400', text: 'text-accent-400' },
  red: { bar: 'border-t-danger', text: 'text-danger' },
  green: { bar: 'border-t-emerald-700', text: 'text-emerald-700' },
  sky: { bar: 'border-t-sky-700', text: 'text-sky-700' },
  violet: { bar: 'border-t-violet-700', text: 'text-violet-700' },
}

interface Stat {
  label: string
  value: string
  image: SectionImage
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
      image: 'caja',
      tone: 'brand',
      href: '/productos',
    },
    {
      label: t('dashboard.lowStock'),
      value: formatNumber(Number(s.low_stock)),
      image: 'movimientos',
      tone: 'amber',
      href: '/productos?bajo=1',
      alert: s.low_stock > 0,
    },
    {
      label: t('dashboard.outOfStock'),
      value: formatNumber(Number(s.out_of_stock)),
      image: 'caja',
      tone: 'red',
      alert: s.out_of_stock > 0,
    },
    {
      label: t('dashboard.stockCost'),
      value: formatMoney(Number(s.stock_cost)),
      image: 'panel',
      tone: 'green',
    },
    {
      label: t('dashboard.stockPrice'),
      value: formatMoney(Number(s.stock_price)),
      image: 'panel',
      tone: 'sky',
    },
    {
      label: t('dashboard.movements7d'),
      value: formatNumber(Number(s.movements_7d)),
      image: 'movimientos',
      tone: 'violet',
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
          <p className="w-fit rounded-full bg-accent-200 px-3 py-1 text-sm font-semibold text-accent-300">
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
                className={`relative flex min-h-24 flex-col-reverse justify-center gap-0.5 rounded-2xl border border-t-4 border-line bg-surface py-4 pr-4 pl-24 shadow-sm transition-transform duration-200 motion-safe:hover:-translate-y-0.5 ${TONES[stat.tone].bar}`}
              >
                <dt className="text-sm font-medium text-muted">
                  {/* Foto decorativa: dentro del término para que la lista siga siendo válida. */}
                  <img
                    src={sectionImages[stat.image]}
                    alt=""
                    width={64}
                    height={64}
                    className="absolute top-1/2 left-4 size-16 -translate-y-1/2 rounded-xl object-cover"
                  />
                  {stat.href ? (
                    <Link to={stat.href} className="underline-offset-2 hover:underline">
                      {stat.label}
                    </Link>
                  ) : (
                    stat.label
                  )}
                </dt>
                <dd
                  className={`truncate text-2xl font-extrabold tabular-nums ${stat.alert ? 'text-danger' : TONES[stat.tone].text}`}
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
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
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
