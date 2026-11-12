import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SelectField } from '../components/ui/SelectField'
import { errorHint } from '../movements/api'
import { formatDate } from '../movements/format'
import { useSupabase } from '../lib/client-context'
import { formatMoney, formatNumber } from '../lib/format'
import { listOrders, setOrderStatus, type CustomerOrder, type OrderStatus } from './api'

const statuses: OrderStatus[] = ['pending', 'ready', 'delivered', 'cancelled']

const badge: Record<OrderStatus, string> = {
  pending: 'bg-brand-50 text-brand-700',
  ready: 'bg-green-50 text-success',
  delivered: 'bg-slate-100 text-ink',
  cancelled: 'bg-red-50 text-danger',
}

type Confirm = { order: CustomerOrder; status: 'delivered' | 'cancelled' } | null

// Pedidos para recoger: los crea el asistente y el equipo los marca como listos, entregados o cancelados.
export function OrdersPanel({ companyId, canEdit, reloadKey }: { companyId: string; canEdit: boolean; reloadKey: number }) {
  const { t } = useTranslation()
  const client = useSupabase()
  const [filter, setFilter] = useState<OrderStatus | ''>('pending')
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const requestId = useRef(0)
  const titleId = useId()

  useEffect(() => {
    const id = ++requestId.current
    listOrders(client, companyId, filter)
      .then((rows) => {
        if (id !== requestId.current) return
        setOrders(rows)
        setLoadError(false)
      })
      .catch(() => id === requestId.current && setLoadError(true))
      .finally(() => id === requestId.current && setLoading(false))
  }, [client, companyId, filter, reloadKey, refresh])

  async function change(order: CustomerOrder, status: OrderStatus) {
    setBusy(true)
    setMessage(null)
    try {
      await setOrderStatus(client, order.id, status)
      setMessage({ tone: 'success', text: t(`orders.done.${status}`, { name: order.customer_name }) })
      setRefresh((n) => n + 1)
    } catch (e) {
      const hint = errorHint(e)
      setMessage({ tone: 'error', text: t(`orders.errors.${hint}`, { defaultValue: t('orders.errors.generic') }) })
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold">
          {t('orders.title')}
        </h2>
        <SelectField
          label={t('orders.filter')}
          value={filter}
          onChange={(e) => {
            setLoading(true)
            setFilter(e.target.value as OrderStatus | '')
          }}
          className="w-56"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(`orders.filterStatus.${s}`)}
            </option>
          ))}
          <option value="">{t('orders.statusAll')}</option>
        </SelectField>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {loadError && <Alert tone="error">{t('orders.loadError')}</Alert>}
      {loading && <p role="status">{t('app.loading')}</p>}
      {!loading && !loadError && orders.length === 0 && <p className="text-muted">{t('orders.none')}</p>}

      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const total = o.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0)
          const open = o.status === 'pending' || o.status === 'ready'
          return (
            <li key={o.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{o.customer_name}</h3>
                <span className={`rounded px-2 py-0.5 text-sm font-semibold ${badge[o.status]}`}>{t(`orders.status.${o.status}`)}</span>
              </div>
              <div className="text-sm text-muted">
                {o.pickup_at && <p className="font-semibold text-ink">{t('orders.pickup', { date: formatDate(o.pickup_at) })}</p>}
                {o.customer_phone && <p>{t('orders.phone', { phone: o.customer_phone })}</p>}
                <p>{t('orders.createdAt', { date: formatDate(o.created_at) })}</p>
              </div>
              <ul className="list-disc pl-5">
                {o.items.map((i, n) => (
                  <li key={n}>
                    {formatNumber(Number(i.quantity))} {i.unit} · {i.product_name}
                  </li>
                ))}
              </ul>
              {o.note && <p className="text-sm break-words">{o.note}</p>}
              <p className="font-semibold">{t('orders.total', { total: formatMoney(total) })}</p>
              {canEdit && open && (
                <div role="group" aria-label={t('orders.actionsFor', { name: o.customer_name })} className="flex flex-wrap gap-2">
                  {o.status === 'pending' && (
                    <Button variant="secondary" disabled={busy} onClick={() => void change(o, 'ready')}>
                      {t('orders.markReady')}
                    </Button>
                  )}
                  <Button disabled={busy} onClick={() => setConfirm({ order: o, status: 'delivered' })}>
                    {t('orders.deliver')}
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => setConfirm({ order: o, status: 'cancelled' })}>
                    {t('orders.cancel')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={confirm !== null}
        busy={busy}
        title={
          confirm
            ? t(confirm.status === 'delivered' ? 'orders.deliverTitle' : 'orders.cancelTitle', { name: confirm.order.customer_name })
            : ''
        }
        body={confirm ? t(confirm.status === 'delivered' ? 'orders.deliverBody' : 'orders.cancelBody') : ''}
        confirmLabel={confirm?.status === 'cancelled' ? t('orders.cancelConfirm') : t('orders.deliverConfirm')}
        cancelLabel={t('orders.keep')}
        onConfirm={() => confirm && void change(confirm.order, confirm.status)}
        onCancel={() => setConfirm(null)}
      />
    </section>
  )
}
