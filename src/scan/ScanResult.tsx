import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LinkButton } from '../components/ui/Button'
import { formatMoney, formatNumber } from '../lib/format'
import { isLowStock } from '../lib/types'
import { stockBreakdown } from '../products/units'
import type { ScannedProduct } from './api'

interface Props {
  data: ScannedProduct
  editable: boolean
}

// Ficha rápida de un producto escaneado: lo que pregunta un empleado en la bodega
// (cuánto hay, dónde está, cuánto vale) y los movimientos más comunes a un toque.
export const ScanResult = forwardRef<HTMLHeadingElement, Props>(function ScanResult({ data, editable }, headingRef) {
  const { t } = useTranslation()
  const { product, packages, components, packageId } = data
  const unit = product.is_kit ? t('movements.kitsUnit') : product.unit
  const scannedPackage = packages.find((p) => p.id === packageId) ?? null
  const status = product.stock <= 0 ? 'out' : isLowStock(product) ? 'low' : 'ok'
  const breakdown = stockBreakdown(product.stock, packages, product.unit)
  const extra = Object.entries(product.extra ?? {}).filter(([, value]) => value !== '' && value !== null)
  const movement = (type: 'in' | 'out') =>
    `/movimientos/nuevo?producto=${product.id}&tipo=${type}${packageId ? `&presentacion=${packageId}` : ''}`

  const facts: [string, string][] = [
    [t('scan.price'), formatMoney(product.price)],
    ...(scannedPackage
      ? [[t('scan.pricePer', { name: scannedPackage.name }), formatMoney(product.price * scannedPackage.factor)] as [string, string]]
      : []),
    ...(editable ? [[t('scan.cost'), formatMoney(product.cost)] as [string, string]] : []),
    [t('scan.unit'), unit],
    [t('scan.location'), data.location ?? t('scan.none')],
    [t('scan.category'), data.category ?? t('scan.none')],
    [t('scan.supplier'), data.supplier ?? t('scan.none')],
  ]

  return (
    <article aria-labelledby="producto-escaneado" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex gap-4 border-b border-line p-4 sm:p-5">
        {data.image ? (
          <img src={data.image} alt="" className="size-20 shrink-0 rounded-xl object-cover sm:size-24" />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-500 text-3xl font-extrabold text-muted uppercase sm:size-24"
          >
            {product.name.trim().charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{t('scan.result')}</p>
          <h2
            id="producto-escaneado"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-extrabold break-words text-ink focus:outline-none sm:text-2xl"
          >
            {product.name}
          </h2>
          <p className="mt-1 font-mono text-sm text-muted">{product.sku}</p>
          {scannedPackage && (
            <p className="mt-2 inline-flex rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-ink">
              {t('scan.scannedPackage', { name: scannedPackage.name })}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-5">
        <section aria-label={t('scan.stock')} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted">{t('scan.stock')}</p>
            <p className="text-ink">
              <span className="text-5xl font-extrabold tracking-tight tabular-nums">{formatNumber(product.stock)}</span>{' '}
              <span className="text-lg font-semibold">{unit}</span>
            </p>
            {breakdown && <p className="mt-1 font-semibold text-ink">= {breakdown.join(' + ')}</p>}
            {product.is_kit && <p className="mt-1 text-sm text-muted">{t('scan.kitStock')}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-full border px-3 py-1 text-sm font-bold ${
                status === 'ok'
                  ? 'border-emerald-700/50 text-emerald-700'
                  : status === 'low'
                    ? 'border-amber-800/60 text-amber-800'
                    : 'border-red-800/60 text-red-800'
              }`}
            >
              {t(`scan.status.${status}`)}
            </span>
            {product.min_stock > 0 && (
              <span className="text-sm text-muted">{t('scan.minimum', { min: formatNumber(product.min_stock), unit })}</span>
            )}
          </div>
        </section>

        {editable && (
          <div className="grid grid-cols-2 gap-2">
            <LinkButton to={movement('in')}>{t('scan.entry')}</LinkButton>
            <LinkButton to={movement('out')} variant="secondary">
              {t('scan.exit')}
            </LinkButton>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-semibold break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {packages.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold text-ink">{t('scan.packages')}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {packages.map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-wrap justify-between gap-x-3 px-3 py-2 ${p.id === packageId ? 'bg-slate-100' : ''}`}
                >
                  <span className="font-semibold text-ink">
                    1 {p.name} = {formatNumber(p.factor)} {product.unit}
                  </span>
                  <span className="font-mono text-sm text-muted">{p.barcode}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {components.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold text-ink">{t('scan.pieces')}</h3>
            <ul className="grid gap-1">
              {components.map((c) => (
                <li key={c.component_id} className="text-ink">
                  {t('scan.piece', { qty: formatNumber(c.quantity), name: c.name, stock: formatNumber(c.stock), unit: c.unit })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {extra.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold text-ink">{t('scan.extra')}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {extra.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-semibold break-words text-ink">
                    {typeof value === 'number' ? formatNumber(value) : value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <LinkButton to={`/productos/${product.id}`} variant="ghost">
            {t('scan.details')}
          </LinkButton>
          <LinkButton to={`/movimientos?producto=${product.id}`} variant="ghost">
            {t('scan.history')}
          </LinkButton>
        </div>
      </div>
    </article>
  )
})
