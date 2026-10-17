import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { parseNumber } from '../lib/format'
import { canEdit, type Product } from '../lib/types'
import { CatalogField } from './CatalogField'
import {
  deleteProduct,
  getProduct,
  IMAGE_BUCKET,
  imageUrl,
  isDuplicateError,
  MAX_IMAGE_BYTES,
  saveProduct,
  uploadImage,
} from './api'
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
  const { current } = useCompany()
  const companyId = current!.company.id
  const editable = canEdit(current?.role)
  const { catalogs, add } = useCatalogs(companyId)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState<FormState>(blank)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
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
        if (!p) return setNotFound(true)
        setProduct(p)
        setForm(toForm(p))
        if (p.image_path) return imageUrl(client, p.image_path).then(setImageSrc)
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
      const value = parseNumber(form[field])
      if (value === null) next[field] = t('products.errors.number')
      else if (value < 0) next[field] = t('products.errors.negative')
    }
    setErrors(next)
    return next
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
    if (Object.keys(found).length > 0) {
      // Lleva el foco al primer campo con error.
      const first = Object.keys(found)[0]
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
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
          stock: parseNumber(form.stock)!,
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
    } catch {
      setConfirmOpen(false)
      setFormError(t('products.errors.delete'))
      setBusy(false)
    }
  }

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
        <fieldset disabled={!editable} className="grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2">
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
          <TextField
            name="unit"
            label={t('products.fields.unit')}
            hint={t('products.fields.unitHint')}
            maxLength={30}
            value={form.unit}
            onChange={set('unit')}
          />
          <TextField name="cost" label={t('products.fields.cost')} inputMode="decimal" value={form.cost} onChange={set('cost')} error={errors.cost} />
          <TextField name="price" label={t('products.fields.price')} inputMode="decimal" value={form.price} onChange={set('price')} error={errors.price} />
          <TextField name="stock" label={t('products.fields.stock')} inputMode="decimal" value={form.stock} onChange={set('stock')} error={errors.stock} />
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
