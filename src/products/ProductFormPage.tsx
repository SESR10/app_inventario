import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber, parseNumber } from '../lib/format'
import { canEdit, type Product, type ProductPackage } from '../lib/types'
import { CatalogField } from './CatalogField'
import {
  deleteProduct,
  getProduct,
  IMAGE_BUCKET,
  imageUrl,
  isDuplicateError,
  isInUseError,
  listKitComponents,
  listPackages,
  MAX_IMAGE_BYTES,
  saveKitComponents,
  savePackages,
  saveProduct,
  uploadImage,
} from './api'
import { KitEditor, type ComponentDraft } from './KitEditor'
import { PackagesEditor, type PackageDraft, type PackageErrors } from './PackagesEditor'
import { UnitField } from './UnitField'
import { stockBreakdown } from './units'
import { useCatalogs } from './useCatalogs'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const NUMBER_FIELDS = ['cost', 'price', 'stock', 'minStock'] as const

interface FormState {
  name: string
  sku: string
  unit: string
  cost: string
  price: string
  stock: string
  minStock: string
  categoryId: string
  locationId: string
  supplierId: string
}

type FieldErrors = Partial<Record<keyof FormState | 'image', string>>

const toDraft = (p: ProductPackage): PackageDraft => ({
  key: p.id,
  id: p.id,
  name: p.name,
  factor: String(p.factor),
  barcode: p.barcode,
})

const blank: FormState = {
  name: '',
  sku: '',
  unit: 'unidad',
  cost: '0',
  price: '0',
  stock: '0',
  minStock: '0',
  categoryId: '',
  locationId: '',
  supplierId: '',
}

const toForm = (p: Product): FormState => ({
  name: p.name,
  sku: p.sku,
  unit: p.unit,
  cost: String(p.cost),
  price: String(p.price),
  stock: String(p.stock),
  minStock: String(p.min_stock),
  categoryId: p.category_id ?? '',
  locationId: p.location_id ?? '',
  supplierId: p.supplier_id ?? '',
})

export function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { t } = useTranslation()
  const client = useSupabase()
  const navigate = useNavigate()
  const location = useLocation()
  const { current } = useCompany()
  const companyId = current!.company.id
  const editable = canEdit(current?.role)
  const { catalogs, add } = useCatalogs(companyId)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState<FormState>(blank)
  const [isKit, setIsKit] = useState(false)
  const [packages, setPackages] = useState<PackageDraft[]>([])
  const [savedPackages, setSavedPackages] = useState<ProductPackage[]>([])
  const [components, setComponents] = useState<ComponentDraft[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [packageErrors, setPackageErrors] = useState<PackageErrors>({})
  const [componentErrors, setComponentErrors] = useState<Record<string, string>>({})
  // Si el producto se creó pero sus presentaciones o piezas no, se llega aquí con el aviso.
  const [formError, setFormError] = useState<string | null>((location.state as { error?: string } | null)?.error ?? null)
  const [busy, setBusy] = useState(false)
  const [newImage, setNewImage] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    getProduct(client, id)
      .then((p) => {
        if (!p) {
          setNotFound(true)
          return
        }
        setProduct(p)
        setForm(toForm(p))
        setIsKit(p.is_kit)
        return Promise.all([
          p.is_kit
            ? listKitComponents(client, p.id).then((rows) =>
                setComponents(rows.map((c) => ({ ...c, quantity: String(c.quantity) }))),
              )
            : listPackages(client, p.id).then((rows) => {
                setSavedPackages(rows)
                setPackages(rows.map(toDraft))
              }),
          p.image_path ? imageUrl(client, p.image_path).then(setImageSrc) : null,
        ])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [client, id])

  // Vista previa de la imagen elegida.
  const preview = useMemo(() => (newImage ? URL.createObjectURL(newImage) : null), [newImage])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])
  const shownImage = preview ?? imageSrc

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  function validate() {
    const next: FieldErrors = {}
    if (!form.name.trim()) next.name = t('products.errors.nameRequired')
    for (const field of NUMBER_FIELDS) {
      // Al editar, el stock solo cambia con movimientos; un kit no tiene stock propio.
      if (field === 'stock' && (!isNew || isKit)) continue
      const value = parseNumber(form[field])
      if (value === null) next[field] = t('products.errors.number')
      else if (value < 0) next[field] = t('products.errors.negative')
    }
    if (!form.unit.trim()) next.unit = t('units.required')

    const pkgErrors: PackageErrors = {}
    const names = new Set<string>()
    if (!isKit) {
      for (const pkg of packages) {
        const name = pkg.name.trim().toLowerCase()
        const factor = parseNumber(pkg.factor)
        const e: PackageErrors[string] = {}
        if (!name) e.name = t('packages.errors.name')
        else if (names.has(name)) e.name = t('packages.errors.duplicate')
        if (factor === null || factor <= 0) e.factor = t('packages.errors.factor')
        if (e.name || e.factor) pkgErrors[pkg.key] = e
        names.add(name)
      }
    }
    const kitErrors: Record<string, string> = {}
    if (isKit) {
      if (components.length === 0) kitErrors.list = t('kits.errors.empty')
      for (const c of components) {
        const qty = parseNumber(c.quantity)
        if (qty === null || qty <= 0) kitErrors[c.component_id] = t('kits.errors.quantity')
      }
    }

    setErrors(next)
    setPackageErrors(pkgErrors)
    setComponentErrors(kitErrors)
    // Nombres de los campos con error, en el orden en que aparecen en la pantalla.
    return [
      ...Object.keys(next),
      ...Object.entries(pkgErrors).map(([key, e]) => (e.name ? `package-name-${key}` : `package-factor-${key}`)),
      ...Object.keys(kitErrors).map((key) => (key === 'list' ? 'kitPiece' : `kit-qty-${key}`)),
    ]
  }

  function onPickImage(file: File | undefined) {
    setErrors((e) => ({ ...e, image: undefined }))
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) return setErrors((e) => ({ ...e, image: t('products.errors.imageType') }))
    if (file.size > MAX_IMAGE_BYTES) return setErrors((e) => ({ ...e, image: t('products.errors.imageSize') }))
    setNewImage(file)
    setRemoveImage(false)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const found = validate()
    if (found.length > 0) {
      // Lleva el foco al primer campo con error.
      document.querySelector<HTMLElement>(`[name="${found[0]}"]`)?.focus()
      return
    }

    setBusy(true)
    try {
      let imagePath = removeImage ? null : (product?.image_path ?? null)
      if (newImage) imagePath = await uploadImage(client, companyId, newImage)

      const saved = await saveProduct(
        client,
        companyId,
        {
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          unit: form.unit.trim() || 'unidad',
          cost: parseNumber(form.cost)!,
          price: parseNumber(form.price)!,
          ...(isNew && { is_kit: isKit, stock: isKit ? 0 : parseNumber(form.stock)! }),
          min_stock: parseNumber(form.minStock)!,
          category_id: form.categoryId || null,
          location_id: form.locationId || null,
          supplier_id: form.supplierId || null,
          image_path: imagePath,
        },
        id,
      )

      // La imagen anterior ya no se usa.
      if (product?.image_path && product.image_path !== imagePath) {
        await client.storage.from(IMAGE_BUCKET).remove([product.image_path])
      }

      try {
        if (isKit) {
          await saveKitComponents(
            client,
            saved.id,
            components.map((c) => ({ component_id: c.component_id, quantity: parseNumber(c.quantity)! })),
          )
        } else if (!isNew || packages.length > 0) {
          await savePackages(
            client,
            saved.id,
            packages.map((p) => ({
              ...(p.id && { id: p.id }),
              name: p.name.trim(),
              factor: parseNumber(p.factor)!,
              barcode: p.barcode.trim() || null,
            })),
          )
        }
      } catch (err) {
        const message = isDuplicateError(err) ? t('packages.errors.barcodeTaken') : t('products.errors.saveExtras')
        // El producto ya existe: se sigue editando ese, no se crea otro.
        if (isNew) return navigate(`/productos/${saved.id}`, { replace: true, state: { error: message } })
        setFormError(message)
        errorSummaryRef.current?.focus()
        setBusy(false)
        return
      }

      navigate('/productos', {
        state: { notice: t('products.saved', { name: form.name.trim(), sku: saved.sku }) },
      })
    } catch (err) {
      if (isDuplicateError(err)) {
        setErrors({ sku: t('products.errors.skuTaken') })
        document.querySelector<HTMLElement>('[name="sku"]')?.focus()
      } else {
        setFormError(t('products.errors.save'))
        errorSummaryRef.current?.focus()
      }
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!product) return
    setBusy(true)
    try {
      await deleteProduct(client, product)
      navigate('/productos', { state: { notice: t('products.deleted', { name: product.name }) } })
    } catch (err) {
      setConfirmOpen(false)
      setFormError(isInUseError(err) ? t('products.errors.inKit') : t('products.errors.delete'))
      setBusy(false)
    }
  }

  const breakdown = product && !isKit ? stockBreakdown(Number(product.stock), savedPackages, product.unit) : null
  const title = isNew ? t('products.new') : (product?.name ?? t('products.edit'))

  if (loading) return <p role="status">{t('app.loading')}</p>
  if (notFound)
    return (
      <section className="flex flex-col gap-4">
        <PageHeading title={t('products.edit')}>{t('products.edit')}</PageHeading>
        <Alert tone="error">{t('products.notFound')}</Alert>
        <LinkButton to="/productos" variant="secondary" className="self-start">
          {t('products.back')}
        </LinkButton>
      </section>
    )

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeading title={title}>{title}</PageHeading>

      <div ref={errorSummaryRef} tabIndex={-1}>
        {formError && <Alert tone="error">{formError}</Alert>}
      </div>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {isNew && (
          <fieldset className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 shadow-sm">
            <legend className="float-left mb-1 font-semibold">{t('kits.typeLegend')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([false, true] as const).map((kit) => (
                <label
                  key={String(kit)}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    isKit === kit ? 'border-brand-700 bg-brand-50' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="productType"
                    className="mt-0.5 size-5 accent-brand-700"
                    checked={isKit === kit}
                    onChange={() => setIsKit(kit)}
                  />
                  <span>
                    <span className="font-medium">{t(kit ? 'kits.typeKit' : 'kits.typeNormal')}</span>
                    <span className="block text-sm text-muted">{t(kit ? 'kits.typeKitHint' : 'kits.typeNormalHint')}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset disabled={!editable} className="grid gap-4 rounded-xl border border-line bg-white shadow-sm p-4 sm:grid-cols-2">
          <TextField
            name="name"
            label={t('products.fields.name')}
            required
            maxLength={200}
            value={form.name}
            onChange={set('name')}
            error={errors.name}
            className="sm:col-span-2"
          />
          <TextField
            name="sku"
            label={t('products.fields.sku')}
            hint={isNew ? t('products.fields.skuHint') : undefined}
            maxLength={64}
            autoComplete="off"
            value={form.sku}
            onChange={set('sku')}
            error={errors.sku}
          />
          <div>
            <UnitField value={form.unit} disabled={!editable} onChange={(unit) => setForm((f) => ({ ...f, unit }))} />
            {errors.unit && <p className="text-sm font-medium text-danger">{errors.unit}</p>}
          </div>
          <TextField name="cost" label={t('products.fields.cost')} inputMode="decimal" value={form.cost} onChange={set('cost')} error={errors.cost} />
          <TextField name="price" label={t('products.fields.price')} inputMode="decimal" value={form.price} onChange={set('price')} error={errors.price} />
          {isNew && isKit ? null : isNew ? (
            <TextField
              name="stock"
              label={t('products.fields.initialStock')}
              inputMode="decimal"
              value={form.stock}
              onChange={set('stock')}
              error={errors.stock}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <span className="font-medium">{t('products.fields.stock')}</span>
              <p className="flex min-h-11 flex-wrap items-center gap-x-3">
                <span>
                  {isKit
                    ? t('kits.available', { count: product?.stock ?? 0 })
                    : `${formatNumber(product?.stock ?? 0)} ${product?.unit}`}
                </span>
                {editable && (
                  <Link to={`/movimientos/nuevo?producto=${id}`} className="text-brand-700 underline">
                    {t('products.recordMovement')}
                  </Link>
                )}
              </p>
              {breakdown && <p className="text-sm text-muted">{t('packages.breakdown', { parts: breakdown.join(', ') })}</p>}
            </div>
          )}
          <TextField
            name="minStock"
            label={t('products.fields.minStock')}
            hint={t('products.fields.minStockHint')}
            inputMode="decimal"
            value={form.minStock}
            onChange={set('minStock')}
            error={errors.minStock}
          />
          <CatalogField
            table="categories"
            label={t('products.fields.category')}
            companyId={companyId}
            items={catalogs.categories}
            value={form.categoryId}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            onCreated={(item) => add('categories', item)}
          />
          <CatalogField
            table="locations"
            label={t('products.fields.location')}
            companyId={companyId}
            items={catalogs.locations}
            value={form.locationId}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, locationId: v }))}
            onCreated={(item) => add('locations', item)}
          />
          <CatalogField
            table="suppliers"
            label={t('products.fields.supplier')}
            companyId={companyId}
            items={catalogs.suppliers}
            value={form.supplierId}
            disabled={!editable}
            onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
            onCreated={(item) => add('suppliers', item)}
          />

          <div className="flex flex-col gap-2 sm:col-span-2">
            <TextField
              ref={fileRef}
              name="image"
              type="file"
              accept={IMAGE_TYPES.join(',')}
              label={t('products.fields.image')}
              hint={t('products.fields.imageHint')}
              onChange={(e) => onPickImage(e.target.files?.[0])}
              error={errors.image}
              className="[&_input]:py-2"
            />
            {shownImage && !removeImage && (
              <div className="flex items-end gap-3">
                <img
                  src={shownImage}
                  alt={t('products.imageAlt', { name: form.name || title })}
                  className="h-32 w-32 rounded-md border border-line object-cover"
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRemoveImage(true)
                    setNewImage(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                >
                  {t('products.removeImage')}
                </Button>
              </div>
            )}
          </div>
        </fieldset>

        {isKit ? (
          <KitEditor
            companyId={companyId}
            kitId={id}
            value={components}
            onChange={setComponents}
            errors={componentErrors}
            disabled={!editable}
          />
        ) : (
          <PackagesEditor
            unit={form.unit.trim()}
            value={packages}
            onChange={setPackages}
            errors={packageErrors}
            disabled={!editable}
          />
        )}

        {product?.extra && Object.keys(product.extra).length > 0 && (
          <section
            aria-labelledby="otros-datos"
            className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-6"
          >
            <h2 id="otros-datos" className="text-lg font-semibold">
              {t('products.extraTitle')}
            </h2>
            <p className="text-sm text-muted">{t('products.extraHint')}</p>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {Object.entries(product.extra).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-sm text-muted">{key}</dt>
                  <dd className="break-words">{typeof value === 'number' ? formatNumber(value) : value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {editable && (
            <Button type="submit" busy={busy}>
              {t('products.save')}
            </Button>
          )}
          <LinkButton to="/productos" variant="secondary">
            {editable ? t('products.cancel') : t('products.back')}
          </LinkButton>
          {!isNew && (
            <LinkButton to={`/etiquetas?ids=${id}`} variant="secondary">
              {t('products.printLabel')}
            </LinkButton>
          )}
          {!isNew && (
            <LinkButton to={`/movimientos?producto=${id}`} variant="secondary">
              {t('products.history')}
            </LinkButton>
          )}
          {!isNew && editable && (
            <Button variant="danger" className="sm:ml-auto" onClick={() => setConfirmOpen(true)}>
              {t('products.delete')}
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={t('products.confirmDeleteTitle', { name: product?.name })}
        body={t('products.confirmDeleteBody')}
        confirmLabel={t('products.confirmDelete')}
        cancelLabel={t('products.cancel')}
        busy={busy}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  )
}
