import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber, parseNumber } from '../lib/format'
import { canEdit, isLowStock, type KitComponent, type MovementType, type ProductPackage } from '../lib/types'
import { getProduct, listKitComponents, listPackages } from '../products/api'
import { packageEquivalence, stockBreakdown } from '../products/units'
import { errorDetail, errorHint, recordMovement } from './api'
import { ProductPicker, type PickedProduct } from './ProductPicker'

const TYPES: MovementType[] = ['in', 'out', 'adjust']
const QUANTITY_LABEL = { in: 'quantityIn', out: 'quantityOut', adjust: 'quantityAdjust' } as const

type Errors = Partial<Record<'product' | 'quantity' | 'reason', string>>

// Lo que necesita un movimiento del producto elegido: sus presentaciones o, si es kit, sus piezas.
interface Details {
  productId: string
  packages: ProductPackage[]
  components: KitComponent[]
}

export function MovementFormPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id
  const [params] = useSearchParams()
  const presetId = params.get('producto')

  const [product, setProduct] = useState<PickedProduct | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [packageId, setPackageId] = useState('')
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
    void getProduct(client, presetId).then((p) => p && choose(p))
  }, [client, presetId])

  // Presentaciones (o piezas, si es un kit) del producto elegido.
  const productId = product?.id
  const productIsKit = product?.is_kit
  useEffect(() => {
    if (!productId) return
    let active = true
    Promise.all([
      productIsKit ? Promise.resolve([]) : listPackages(client, productId),
      productIsKit ? listKitComponents(client, productId) : Promise.resolve([]),
    ])
      .then(([packages, components]) => active && setDetails({ productId, packages, components }))
      .catch(() => active && setDetails({ productId, packages: [], components: [] }))
    return () => {
      active = false
    }
  }, [client, productId, productIsKit])

  function choose(p: PickedProduct | null, scannedPackage: string | null = null) {
    setProduct(p)
    setPackageId(scannedPackage ?? '')
    // Un kit no se ajusta: su stock es cuántos se pueden armar con las piezas.
    if (p?.is_kit) setType((current) => (current === 'adjust' ? 'in' : current))
  }

  const loaded = details && details.productId === productId ? details : null
  const packages = loaded?.packages ?? []
  const components = loaded?.components ?? []
  const pkg = packages.find((p) => p.id === packageId) ?? null
  const factor = pkg?.factor ?? 1
  const shownUnit = pkg?.name ?? product?.unit ?? ''
  const types = product?.is_kit ? TYPES.filter((v) => v !== 'adjust') : TYPES

  const amount = parseNumber(quantity)
  // Cantidad en la unidad base (lo que realmente cambia en el stock).
  const base = amount === null ? null : Math.round(amount * factor * 1000) / 1000
  const after =
    product && base !== null && base >= 0
      ? type === 'in'
        ? product.stock + base
        : type === 'out'
          ? product.stock - base
          : base
      : null
  // En un kit, cuánto se mueve de cada pieza.
  const pieces =
    product?.is_kit && base !== null && base > 0
      ? components.map((c) => ({ ...c, need: Math.round(c.quantity * base * 1000) / 1000 }))
      : []

  function validate(): Errors {
    const next: Errors = {}
    if (!product) next.product = t('movements.errors.product')
    if (amount === null) next.quantity = t('movements.errors.number')
    else if (amount < 0) next.quantity = t('movements.errors.negative')
    else if (type !== 'adjust' && amount === 0) next.quantity = t('movements.errors.positive')
    else if (product?.is_kit && !Number.isInteger(base)) next.quantity = t('movements.errors.kitWhole')
    else if (product?.is_kit && loaded && components.length === 0) next.quantity = t('movements.errors.kitEmpty')
    else if (product?.is_kit && type === 'out' && pieces.some((c) => c.need > c.stock)) {
      const missing = pieces.find((c) => c.need > c.stock)!
      next.quantity = t('movements.errors.kitInsufficient', {
        name: missing.name,
        stock: formatNumber(missing.stock),
        unit: missing.unit,
      })
    } else if (product && !product.is_kit && type === 'out' && base! > product.stock)
      next.quantity = t('movements.errors.insufficient', { stock: formatNumber(product.stock), unit: product.unit })
    else if (product && type === 'adjust' && base === product.stock) next.quantity = t('movements.errors.noChange')
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
      const stock = await recordMovement(client, product!.id, type, amount!, reason, pkg?.id ?? null)
      const updated = { ...product!, stock }
      const unit = updated.unit
      const parts = stockBreakdown(stock, packages, unit)
      setResult({
        saved: updated.is_kit
          ? t('movements.savedKit', { name: updated.name, count: stock })
          : t('movements.saved', {
              name: updated.name,
              stock: formatNumber(stock),
              unit,
              detail: parts ? ` (${parts.join(', ')})` : '',
            }),
        low: isLowStock(updated)
          ? t('movements.savedLow', { name: updated.name, min: formatNumber(updated.min_stock) })
          : null,
      })
      setQuantity('')
      setReason('')
      // Listo para el siguiente: con producto fijo (desde su ficha) se queda; si no, se busca otro.
      if (presetId) setProduct(updated)
      else choose(null)
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
              : product!.is_kit
                ? t('movements.errors.kitInsufficientShort', { name: errorDetail(err) })
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

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border border-line bg-white shadow-sm p-4">
        <ProductPicker
          ref={searchRef}
          companyId={companyId}
          value={product}
          onChange={(p, scannedPackage) => {
            choose(p, scannedPackage)
            setErrors((e) => ({ ...e, product: undefined }))
            if (!p) setFocusRequest({ target: 'search' })
          }}
          error={errors.product}
        />

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-medium">{t('movements.type')}</legend>
          {types.map((value) => (
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

        {packages.length > 0 && (
          <SelectField
            name="package"
            label={t('movements.package')}
            hint={t('movements.packageHint')}
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="max-w-sm"
          >
            <option value="">{product?.unit}</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({packageEquivalence(p, product?.unit ?? '')})
              </option>
            ))}
          </SelectField>
        )}

        <TextField
          name="quantity"
          label={`${t(`movements.${QUANTITY_LABEL[type]}`)} (${product?.is_kit ? t('movements.kitsUnit') : shownUnit || '…'})`}
          inputMode="decimal"
          autoComplete="off"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
          className="max-w-xs"
        />
        <div aria-live="polite" className="min-h-6 text-muted">
          {product && !product.is_kit && after !== null && after >= 0 && (
            <p>
              {pkg && base !== null && t('movements.equivalent', { qty: formatNumber(base), unit: product.unit }) + ' '}
              {t('movements.preview', { stock: formatNumber(after), unit: product.unit })}
            </p>
          )}
          {pieces.length > 0 && (
            <>
              <p>{t(type === 'out' ? 'movements.kitOut' : 'movements.kitIn')}</p>
              <ul className="list-disc pl-6">
                {pieces.map((c) => (
                  <li key={c.component_id}>
                    {formatNumber(c.need)} {c.unit} · {c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

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
