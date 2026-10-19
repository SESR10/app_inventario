import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber, parseNumber } from '../lib/format'
import { canEdit, isLowStock, type MovementType } from '../lib/types'
import { getProduct } from '../products/api'
import { errorHint, recordMovement } from './api'
import { ProductPicker, type PickedProduct } from './ProductPicker'

const TYPES: MovementType[] = ['in', 'out', 'adjust']
const QUANTITY_LABEL = { in: 'quantityIn', out: 'quantityOut', adjust: 'quantityAdjust' } as const

type Errors = Partial<Record<'product' | 'quantity' | 'reason', string>>

export function MovementFormPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id
  const [params] = useSearchParams()
  const presetId = params.get('producto')

  const [product, setProduct] = useState<PickedProduct | null>(null)
  const [type, setType] = useState<MovementType>('in')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ saved: string; low: string | null } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  // El foco se mueve después de que React dibuja (el buscador puede no existir aún).
  const [focusRequest, setFocusRequest] = useState<{ target: 'search' | 'result' } | null>(null)

  useEffect(() => {
    if (!focusRequest) return
    ;(focusRequest.target === 'search' ? searchRef : resultRef).current?.focus()
  }, [focusRequest])

  // Producto elegido desde su ficha (?producto=id).
  useEffect(() => {
    if (!presetId) return
    void getProduct(client, presetId).then((p) => p && setProduct(p))
  }, [client, presetId])

  const amount = parseNumber(quantity)
  const after =
    product && amount !== null && amount >= 0
      ? type === 'in'
        ? product.stock + amount
        : type === 'out'
          ? product.stock - amount
          : amount
      : null

  function validate(): Errors {
    const next: Errors = {}
    if (!product) next.product = t('movements.errors.product')
    if (amount === null) next.quantity = t('movements.errors.number')
    else if (amount < 0) next.quantity = t('movements.errors.negative')
    else if (type !== 'adjust' && amount === 0) next.quantity = t('movements.errors.positive')
    else if (product && type === 'out' && amount > product.stock)
      next.quantity = t('movements.errors.insufficient', { stock: formatNumber(product.stock), unit: product.unit })
    else if (product && type === 'adjust' && amount === product.stock) next.quantity = t('movements.errors.noChange')
    if (type === 'adjust' && !reason.trim()) next.reason = t('movements.reasonRequired')
    return next
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setResult(null)
    setFormError(null)
    const found = validate()
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }

    setBusy(true)
    try {
      const stock = await recordMovement(client, product!.id, type, amount!, reason)
      const updated = { ...product!, stock }
      const unit = updated.unit
      setResult({
        saved: t('movements.saved', { name: updated.name, stock: formatNumber(stock), unit }),
        low: isLowStock(updated)
          ? t('movements.savedLow', { name: updated.name, min: formatNumber(updated.min_stock) })
          : null,
      })
      setQuantity('')
      setReason('')
      // Listo para el siguiente: con producto fijo (desde su ficha) se queda; si no, se busca otro.
      if (presetId) setProduct(updated)
      else setProduct(null)
      setFocusRequest({ target: presetId ? 'result' : 'search' })
    } catch (err) {
      const hint = errorHint(err)
      if (hint === 'insufficient_stock' || hint === 'no_change') {
        // El stock cambió mientras tanto: se recarga para mostrar el valor real.
        const fresh = await getProduct(client, product!.id).catch(() => null)
        if (fresh) setProduct(fresh)
        setErrors({
          quantity:
            hint === 'no_change'
              ? t('movements.errors.noChange')
              : t('movements.errors.insufficient', {
                  stock: formatNumber(fresh?.stock ?? product!.stock),
                  unit: product!.unit,
                }),
        })
        document.querySelector<HTMLElement>('[name="quantity"]')?.focus()
      } else {
        setFormError(t('movements.errors.save'))
        setFocusRequest({ target: 'result' })
      }
    } finally {
      setBusy(false)
    }
  }

  const title = t('movements.recordTitle')

  if (!canEdit(current?.role)) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading title={title}>{title}</PageHeading>
        <Alert>{t('movements.viewerNote')}</Alert>
        <LinkButton to="/movimientos" variant="secondary" className="self-start">
          {t('movements.history')}
        </LinkButton>
      </section>
    )
  }

  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <PageHeading title={title}>{title}</PageHeading>

      <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
        {formError && <Alert tone="error">{formError}</Alert>}
        {result && <Alert tone="success">{result.saved}</Alert>}
        {result?.low && <Alert>{result.low}</Alert>}
      </div>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 rounded-lg border border-line bg-white p-4">
        <ProductPicker
          ref={searchRef}
          companyId={companyId}
          value={product}
          onChange={(p) => {
            setProduct(p)
            setErrors((e) => ({ ...e, product: undefined }))
            if (!p) setFocusRequest({ target: 'search' })
          }}
          error={errors.product}
        />

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-medium">{t('movements.type')}</legend>
          {TYPES.map((value) => (
            <label key={value} className="flex min-h-11 items-start gap-2 py-1">
              <input
                type="radio"
                name="type"
                className="mt-0.5 size-5 accent-brand-700"
                checked={type === value}
                onChange={() => setType(value)}
              />
              <span>
                <span className="font-medium">{t(`movements.types.${value}`)}</span>
                <span className="block text-sm text-muted">{t(`movements.typeHints.${value}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <TextField
          name="quantity"
          label={t(`movements.${QUANTITY_LABEL[type]}`)}
          inputMode="decimal"
          autoComplete="off"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
          className="max-w-xs"
        />
        <p aria-live="polite" className="min-h-6 text-muted">
          {product && after !== null && after >= 0 && t('movements.preview', { stock: formatNumber(after), unit: product.unit })}
        </p>

        <TextField
          name="reason"
          label={t('movements.reason')}
          hint={t('movements.reasonHint')}
          required={type === 'adjust'}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={busy}>
            {t('movements.submit')}
          </Button>
          <LinkButton to="/movimientos" variant="secondary">
            {t('movements.history')}
          </LinkButton>
        </div>
      </form>
    </section>
  )
}
