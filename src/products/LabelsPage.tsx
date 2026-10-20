import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { SelectField } from '../components/ui/SelectField'
import { useSupabase } from '../lib/client-context'
import { formatMoney } from '../lib/format'
import type { Product, ProductPackage } from '../lib/types'
import { getProductsByIds, listPackagesOf, MAX_LABELS } from './api'
import { Barcode, QrCode } from './codes'
import { packageEquivalence } from './units'


type CodeType = 'barcode' | 'qr' | 'both'
type LabelProduct = Pick<Product, 'id' | 'sku' | 'name' | 'price' | 'unit'>

// Una etiqueta: la del producto o la de una de sus presentaciones (caja, pieza…).
interface Label {
  key: string
  name: string
  detail: string | null
  code: string
  price: number
}

export function LabelsPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const [params] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX_LABELS)
  const idsKey = ids.join(',')

  const [products, setProducts] = useState<LabelProduct[]>([])
  const [loading, setLoading] = useState(ids.length > 0)
  const [error, setError] = useState(false)
  const [codeType, setCodeType] = useState<CodeType>('barcode')
  const [copies, setCopies] = useState(1)
  const [showPrice, setShowPrice] = useState(true)
  const [packages, setPackages] = useState<(ProductPackage & { product_id: string })[]>([])
  const [withPackages, setWithPackages] = useState(false)

  useEffect(() => {
    if (!idsKey) return
    Promise.all([getProductsByIds(client, idsKey.split(',')), listPackagesOf(client, idsKey.split(','))])
      .then(([rows, pkgs]) => {
        setProducts(rows)
        setPackages(pkgs)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [client, idsKey])

  const kinds: Label[] = products.flatMap((p) => [
    { key: p.id, name: p.name, detail: null, code: p.sku, price: p.price },
    ...(withPackages ? packages.filter((k) => k.product_id === p.id) : []).map((k) => ({
      key: k.id,
      name: p.name,
      detail: `${k.name} · ${packageEquivalence(k, p.unit)}`,
      code: k.barcode,
      // Precio de la presentación: precio de la unidad base por lo que trae.
      price: Math.round(p.price * k.factor * 100) / 100,
    })),
  ])
  const labels = kinds.flatMap((label) => Array.from({ length: copies }, (_, i) => ({ ...label, key: `${label.key}-${i}` })))

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 print:hidden">
        <PageHeading title={t('labels.title')}>{t('labels.title')}</PageHeading>
        <p className="text-muted">{t('labels.intro')}</p>
        {error && <Alert tone="error">{t('products.loadError')}</Alert>}
        {!loading && products.length === 0 && !error && <Alert>{t('labels.none')}</Alert>}

        <div className="grid gap-3 rounded-xl border border-line bg-white shadow-sm p-4 sm:grid-cols-3 sm:items-end">
          <SelectField label={t('labels.type')} value={codeType} onChange={(e) => setCodeType(e.target.value as CodeType)}>
            <option value="barcode">{t('labels.typeBarcode')}</option>
            <option value="qr">{t('labels.typeQr')}</option>
            <option value="both">{t('labels.typeBoth')}</option>
          </SelectField>
          <SelectField label={t('labels.copies')} value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
          <Checkbox label={t('labels.showPrice')} checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          {packages.length > 0 && (
            <Checkbox
              label={t('labels.withPackages', { count: packages.length })}
              checked={withPackages}
              onChange={(e) => setWithPackages(e.target.checked)}
              className="sm:col-span-3"
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()} disabled={products.length === 0}>
            {t('labels.print')}
          </Button>
          <LinkButton to="/productos" variant="secondary">
            {t('products.back')}
          </LinkButton>
        </div>
      </div>

      {loading ? (
        <p role="status">{t('app.loading')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.4cm,1fr))] gap-2 print:gap-1">
          {labels.map(({ key, name, detail, code, price }) => (
            <li
              key={key}
              className="flex min-h-[3.4cm] break-inside-avoid flex-col justify-between gap-1 rounded border border-dashed border-slate-400 bg-white p-2 text-black"
            >
              <p className="line-clamp-2 text-sm leading-tight font-semibold">{name}</p>
              {detail && <p className="text-xs font-semibold">{detail}</p>}
              <div className="flex items-center justify-between gap-2">
                {codeType !== 'qr' && <Barcode value={code} label={t('labels.barcodeAlt', { sku: code })} />}
                {codeType !== 'barcode' && <QrCode value={code} label={t('labels.qrAlt', { sku: code })} />}
              </div>
              <p className="flex justify-between text-xs">
                <span className="font-mono">{code}</span>
                {showPrice && <span className="font-semibold">{formatMoney(price)}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
