import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { formatNumber } from '../lib/format'
import type { Movement } from '../lib/types'
import { formatDate, formatQuantity, reasonText, typeBadge } from './format'

// Lista de movimientos: cada uno dice qué, cuánto, cuándo, quién y por qué.
// Se acomoda al ancho de su contenedor (no de la pantalla): sirve en el panel y en el historial.
export function MovementList({ rows, label }: { rows: Movement[]; label: string }) {
  const { t } = useTranslation()
  return (
    <ol aria-label={label} className="@container divide-y divide-line rounded-xl border border-line bg-white shadow-sm">
      {rows.map((m) => (
        <li key={m.id} className="flex flex-col gap-1 px-3 py-3 @xl:flex-row @xl:items-start @xl:gap-4">
          <div className="flex items-center gap-2 @xl:w-44 @xl:shrink-0 @xl:flex-col @xl:items-start">
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${typeBadge[m.type]}`}>
              {t(`movements.types.${m.type}`)}
            </span>
            <time dateTime={m.created_at} className="text-sm text-muted">
              {formatDate(m.created_at)}
            </time>
          </div>
          <div className="min-w-0 flex-1">
            <Link to={`/productos/${m.product_id}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
              {m.product_name}
            </Link>
            <span className="text-sm text-muted"> · {m.product_sku}</span>
            <p className="text-sm">{reasonText(t, m.reason)}</p>
            <p className="text-sm break-words text-muted">
              {m.user_email ? t('movements.by', { email: m.user_email }) : t('movements.byUnknown')}
            </p>
          </div>
          <div className="text-sm @xl:w-48 @xl:text-right">
            <p className="font-semibold">
              <span className="sr-only">{t('movements.quantity')}: </span>
              {formatQuantity(m.quantity)} {m.unit}
            </p>
            <p className="text-muted">{t('movements.stockAfter', { stock: formatNumber(m.stock_after), unit: m.unit })}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
