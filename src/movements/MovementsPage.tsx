import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { canEdit, type Movement, type MovementType, type Product } from '../lib/types'
import { getProduct } from '../products/api'
import { emptyMovementFilters, listMovements, MOVEMENTS_PAGE, type MovementFilters } from './api'
import { MovementList } from './MovementList'

export function MovementsPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id
  const [params] = useSearchParams()
  const productId = params.get('producto') ?? ''

  const [filters, setFilters] = useState<MovementFilters>(emptyMovementFilters)
  const [rows, setRows] = useState<Movement[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!productId) return
    void getProduct(client, productId).then(setProduct)
  }, [client, productId])

  useEffect(() => {
    const id = ++requestId.current
    listMovements(client, companyId, { ...filters, productId }, null)
      .then((page) => {
        if (id !== requestId.current) return
        setRows(page)
        setHasMore(page.length === MOVEMENTS_PAGE)
        setError(false)
      })
      .catch(() => id === requestId.current && setError(true))
      .finally(() => id === requestId.current && setLoading(false))
  }, [client, companyId, filters, productId])

  function loadMore() {
    const id = requestId.current
    setLoading(true)
    listMovements(client, companyId, { ...filters, productId }, rows[rows.length - 1])
      .then((page) => {
        if (id !== requestId.current) return
        setRows((prev) => [...prev, ...page])
        setHasMore(page.length === MOVEMENTS_PAGE)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  function update(patch: Partial<MovementFilters>) {
    setLoading(true)
    setFilters((f) => ({ ...f, ...patch }))
  }

  const title = t('movements.title')

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading title={title}>{title}</PageHeading>
        {canEdit(current?.role) && (
          <LinkButton to={productId ? `/movimientos/nuevo?producto=${productId}` : '/movimientos/nuevo'}>
            {t('movements.record')}
          </LinkButton>
        )}
      </div>

      {productId && product && (
        <p className="flex flex-wrap items-center gap-x-3">
          <span className="font-medium">{t('movements.productFilter', { name: product.name, sku: product.sku })}</span>
          <Link to="/movimientos" className="text-brand-700 underline">
            {t('movements.allProducts')}
          </Link>
        </p>
      )}

      <search className="rounded-lg border border-line bg-white p-4">
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">{t('movements.filters')}</legend>
          <SelectField
            label={t('movements.type')}
            value={filters.type}
            onChange={(e) => update({ type: e.target.value as MovementType | '' })}
          >
            <option value="">{t('movements.allTypes')}</option>
            {(['in', 'out', 'adjust'] as const).map((type) => (
              <option key={type} value={type}>
                {t(`movements.types.${type}`)}
              </option>
            ))}
          </SelectField>
          <TextField type="date" label={t('movements.from')} value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          <TextField type="date" label={t('movements.to')} value={filters.to} onChange={(e) => update({ to: e.target.value })} />
        </fieldset>
      </search>

      {error && <Alert tone="error">{t('movements.loadError')}</Alert>}
      <p role="status" className="sr-only">
        {loading ? t('app.loading') : rows.length === 0 ? t('movements.empty') : ''}
      </p>
      {!loading && rows.length === 0 && !error && <p className="text-muted">{t('movements.empty')}</p>}
      {rows.length > 0 && <MovementList rows={rows} label={t('movements.listLabel')} />}
      {hasMore && (
        <Button variant="secondary" onClick={loadMore} busy={loading} className="self-center">
          {t('movements.loadMore')}
        </Button>
      )}
    </section>
  )
}
