import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { canEdit, type ProductRow } from '../lib/types'
import { MAX_LABELS } from './LabelsPage'
import { ProductList } from './ProductList'
import { countProducts, emptyFilters, PAGE_SIZE, searchProducts, type ProductFilters } from './api'
import { useCatalogs } from './useCatalogs'

const SEARCH_DELAY_MS = 300

export function ProductsPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const navigate = useNavigate()
  const location = useLocation()
  const { current } = useCompany()
  const companyId = current!.company.id
  const { catalogs } = useCatalogs(companyId)

  const [queryInput, setQueryInput] = useState('')
  const [filters, setFilters] = useState<ProductFilters>(emptyFilters)
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const requestId = useRef(0)
  const notice = (location.state as { notice?: string } | null)?.notice

  // La búsqueda espera a que la persona deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.query === queryInput ? f : { ...f, query: queryInput })), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [queryInput])

  // Primera página y total cada vez que cambian los filtros.
  useEffect(() => {
    const id = ++requestId.current
    Promise.all([searchProducts(client, companyId, filters, null), countProducts(client, companyId, filters)])
      .then(([page, count]) => {
        if (id !== requestId.current) return
        setRows(page)
        setTotal(count)
        setHasMore(page.length === PAGE_SIZE)
        setError(false)
      })
      .catch(() => {
        if (id === requestId.current) setError(true)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [client, companyId, filters])

  const loadMore = useCallback(() => {
    if (loading || rows.length === 0) return
    const id = requestId.current
    setLoading(true)
    searchProducts(client, companyId, filters, rows[rows.length - 1])
      .then((page) => {
        if (id !== requestId.current) return
        setRows((prev) => [...prev, ...page])
        setHasMore(page.length === PAGE_SIZE)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [client, companyId, filters, rows, loading])

  function updateFilter(patch: Partial<ProductFilters>) {
    setLoading(true)
    setFilters((f) => ({ ...f, ...patch }))
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasFilters =
    queryInput !== '' || filters.categoryId !== '' || filters.locationId !== '' || filters.supplierId !== '' || filters.lowStock
  const isEmptyCatalog = !loading && total === 0 && !hasFilters

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading title={t('products.title')}>{t('products.title')}</PageHeading>
        {canEdit(current?.role) && <LinkButton to="/productos/nuevo">{t('products.new')}</LinkButton>}
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{t('products.loadError')}</Alert>}

      <search className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4">
        <TextField
          label={t('products.search')}
          type="search"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
        />
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">{t('products.filters')}</legend>
          <SelectField
            label={t('products.fields.category')}
            value={filters.categoryId}
            onChange={(e) => updateFilter({ categoryId: e.target.value })}
          >
            <option value="">{t('products.allCategories')}</option>
            {catalogs.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('products.fields.location')}
            value={filters.locationId}
            onChange={(e) => updateFilter({ locationId: e.target.value })}
          >
            <option value="">{t('products.allLocations')}</option>
            {catalogs.locations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('products.fields.supplier')}
            value={filters.supplierId}
            onChange={(e) => updateFilter({ supplierId: e.target.value })}
          >
            <option value="">{t('products.allSuppliers')}</option>
            {catalogs.suppliers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox
            label={t('products.lowStockOnly')}
            checked={filters.lowStock}
            onChange={(e) => updateFilter({ lowStock: e.target.checked })}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setQueryInput('')
                updateFilter(emptyFilters)
              }}
            >
              {t('products.clearFilters')}
            </Button>
          )}
        </div>
      </search>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="font-medium">
          {loading && rows.length === 0 ? t('products.searching') : total !== null && t('products.count', { count: total })}
        </p>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{t('products.selectedCount', { count: selected.size })}</span>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {t('products.clearSelection')}
            </Button>
            <Button
              disabled={selected.size > MAX_LABELS}
              onClick={() => navigate(`/etiquetas?ids=${[...selected].join(',')}`)}
            >
              {t('products.printLabels')}
            </Button>
          </div>
        )}
      </div>
      {selected.size > MAX_LABELS && <Alert tone="error">{t('labels.tooMany', { max: MAX_LABELS })}</Alert>}

      {isEmptyCatalog ? (
        <p className="text-muted">{t('products.emptyCatalog')}</p>
      ) : !loading && rows.length === 0 ? (
        <p className="text-muted">{t('products.empty')}</p>
      ) : (
        <ProductList
          rows={rows}
          total={total}
          hasMore={hasMore}
          loading={loading}
          selected={selected}
          onToggle={toggle}
          onLoadMore={loadMore}
        />
      )}
    </section>
  )
}
