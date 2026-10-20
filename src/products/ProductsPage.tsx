import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { formatNumber } from '../lib/format'
import { canEdit, type ProductRow } from '../lib/types'
import { ProductList } from './ProductList'
import {
  countProducts, deleteProducts, emptyFilters, MAX_LABELS, PAGE_SIZE, searchProducts, type ProductFilters,
} from './api'
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
  // ?bajo=1 abre la lista filtrada por stock bajo (enlace desde el panel).
  const [filters, setFilters] = useState<ProductFilters>(() => ({
    ...emptyFilters,
    lowStock: new URLSearchParams(location.search).has('bajo'),
  }))
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Borrado en bloque: los elegidos o todos los de la lista (con los filtros actuales).
  const [deleteMode, setDeleteMode] = useState<'selected' | 'all' | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deleteResult, setDeleteResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
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

  const deleteCount = deleteMode === 'selected' ? selected.size : (total ?? 0)

  async function confirmDelete() {
    if (!deleteMode) return
    setDeleting(0)
    try {
      const target = deleteMode === 'selected' ? { ids: [...selected] } : { filters }
      const { deleted, inKit } = await deleteProducts(client, companyId, target, setDeleting)
      setDeleteResult({
        tone: 'success',
        text:
          t('products.bulkDeleted', { count: deleted }) +
          (inKit > 0 ? ' ' + t('products.bulkInKit', { count: inKit }) : ''),
      })
      setSelected(new Set())
    } catch {
      setDeleteResult({ tone: 'error', text: t('products.bulkDeleteError') })
    } finally {
      setDeleting(null)
      setDeleteMode(null)
      updateFilter({})
    }
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
      {deleteResult && <Alert tone={deleteResult.tone}>{deleteResult.text}</Alert>}
      {error && <Alert tone="error">{t('products.loadError')}</Alert>}

      <search className="flex flex-col gap-3 rounded-xl border border-line bg-white shadow-sm p-4">
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p role="status" className="font-medium">
            {loading && rows.length === 0 ? t('products.searching') : total !== null && t('products.count', { count: total })}
          </p>
          {current?.role === 'admin' && !!total && selected.size === 0 && (
            <Button variant="ghost" onClick={() => setDeleteMode('all')} className="px-0 text-danger">
              {hasFilters ? t('products.deleteList', { count: total }) : t('products.deleteAll', { count: total })}
            </Button>
          )}
        </div>
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
            {canEdit(current?.role) && (
              <Button variant="danger" onClick={() => setDeleteMode('selected')}>
                {t('products.deleteSelected', { count: selected.size })}
              </Button>
            )}
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
      <ConfirmDialog
        open={deleteMode !== null}
        title={t('products.bulkDeleteTitle', { count: deleteCount })}
        body={
          deleting !== null
            ? t('products.bulkDeleting', { done: formatNumber(deleting), total: formatNumber(deleteCount) })
            : t('products.bulkDeleteBody', { count: deleteCount })
        }
        confirmLabel={t('products.bulkDeleteConfirm', { count: deleteCount })}
        cancelLabel={t('products.cancel')}
        busy={deleting !== null}
        typeToConfirm={
          deleteMode === 'all' || deleteCount > 20
            ? { word: t('products.bulkWord'), label: t('products.bulkTypeLabel', { word: t('products.bulkWord') }) }
            : undefined
        }
        onConfirm={() => void confirmDelete()}
        onCancel={() => deleting === null && setDeleteMode(null)}
      />
    </section>
  )
}
