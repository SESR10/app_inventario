import { forwardRef, useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber } from '../lib/format'
import type { ProductRow } from '../lib/types'
import { emptyFilters, findCode, getProduct, searchProducts } from '../products/api'

export type PickedProduct = Pick<ProductRow, 'id' | 'name' | 'sku' | 'unit' | 'stock' | 'min_stock' | 'is_kit'>

const SEARCH_DELAY_MS = 250
const MAX_RESULTS = 8

interface Props {
  companyId: string
  value: PickedProduct | null
  // packageId: la presentación, si se escaneó su código (por ejemplo la caja).
  onChange: (product: PickedProduct | null, packageId?: string | null) => void
  error?: string | null
  name?: string
  label?: string
  hint?: string
}

// Busca un producto por nombre o SKU. Con lector de código de barras: escanear y Enter elige el producto.
export const ProductPicker = forwardRef<HTMLInputElement, Props>(function ProductPicker(
  { companyId, value, onChange, error, name = 'product', label, hint },
  ref,
) {
  const { t } = useTranslation()
  const client = useSupabase()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductRow[] | null>(null)

  useEffect(() => {
    const text = query.trim()
    if (!text) return
    let active = true
    const timer = setTimeout(() => {
      searchProducts(client, companyId, { ...emptyFilters, query: text }, null)
        .then((rows) => active && setResults(rows.slice(0, MAX_RESULTS)))
        .catch(() => active && setResults([]))
    }, SEARCH_DELAY_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [client, companyId, query])

  function pick(product: PickedProduct, packageId: string | null = null) {
    onChange(product, packageId)
    setQuery('')
    setResults(null)
  }

  // Enter: si el texto es un código (SKU o código de una presentación, como al escanear)
  // o hay un solo resultado, lo elige.
  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const text = query.trim()
    if (!text) return
    const code = await findCode(client, companyId, text).catch(() => null)
    const product = code && (await getProduct(client, code.product_id).catch(() => null))
    if (product) return pick(product, code.package_id)
    const rows = await searchProducts(client, companyId, { ...emptyFilters, query: text }, null).catch(() => [])
    const exact = rows.find((r) => r.sku.toLowerCase() === text.toLowerCase())
    if (exact) pick(exact)
    else if (rows.length === 1) pick(rows[0])
    else setResults(rows.slice(0, MAX_RESULTS))
  }

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium">{t('movements.product')}</span>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-slate-50 px-3 py-2">
          <div>
            <p className="font-semibold">{value.name}</p>
            <p className="text-sm text-muted">
              {value.sku} · {t('movements.currentStock', { stock: formatNumber(value.stock), unit: value.is_kit ? t('movements.kitsUnit') : value.unit })}
            </p>
          </div>
          <Button variant="secondary" onClick={() => onChange(null)}>
            {t('movements.change')}
          </Button>
        </div>
      </div>
    )
  }

  const shown = query.trim() ? results : null
  return (
    <div className="flex flex-col gap-2">
      <TextField
        ref={ref}
        name={name}
        type="search"
        label={label ?? t('movements.searchProduct')}
        hint={hint ?? t('movements.searchHint')}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => void onKeyDown(e)}
        error={error}
      />
      <p role="status" className="sr-only">
        {shown && (shown.length ? t('movements.results', { count: shown.length }) : t('movements.noResults'))}
      </p>
      {shown && shown.length === 0 && <p className="text-muted">{t('movements.noResults')}</p>}
      {shown && shown.length > 0 && (
        <ul aria-label={t('movements.resultsLabel')} className="divide-y divide-line rounded-md border border-line bg-white">
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => pick(row)}
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-sm text-muted">
                  {row.sku} · {t('movements.currentStock', { stock: formatNumber(row.stock), unit: row.is_kit ? t('movements.kitsUnit') : row.unit })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
