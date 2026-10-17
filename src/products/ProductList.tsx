import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { formatMoney, formatNumber } from '../lib/format'
import { isLowStock, type ProductRow } from '../lib/types'

interface Props {
  rows: ProductRow[]
  total: number | null
  hasMore: boolean
  loading: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onLoadMore: () => void
}

const ROW_HEIGHT = 88

// Lista virtualizada: solo dibuja las filas visibles, así funciona igual con 50 o 100.000 productos.
export function ProductList({ rows, total, hasMore, loading, selected, onToggle, onLoadMore }: Props) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  // El proyecto no usa React Compiler, así que esta advertencia no aplica.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // Medida inicial para el primer dibujo (y para entornos sin layout, como las pruebas).
    initialRect: { width: 800, height: 600 },
  })

  const items = virtualizer.getVirtualItems()
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1

  // Pide la siguiente página al acercarse al final.
  useEffect(() => {
    if (hasMore && !loading && lastIndex >= rows.length - 10) onLoadMore()
  }, [hasMore, loading, lastIndex, rows.length, onLoadMore])

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="h-[60dvh] min-h-80 overflow-auto rounded-lg border border-line bg-white"
        tabIndex={-1}
      >
        <ul
          aria-label={t('products.listLabel')}
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => {
            const row = rows[item.index]
            const low = isLowStock(row)
            return (
              <li
                key={row.id}
                data-index={item.index}
                ref={virtualizer.measureElement}
                aria-setsize={total ?? -1}
                aria-posinset={item.index + 1}
                className="absolute top-0 left-0 w-full border-b border-line"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    label={t('products.select', { name: row.name })}
                    hideLabel
                    checked={selected.has(row.id)}
                    onChange={() => onToggle(row.id)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link to={`/productos/${row.id}`} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                        {row.name}
                      </Link>
                      <p className="truncate text-sm text-muted">
                        {row.sku}
                        {row.category_name && ` · ${row.category_name}`}
                        {row.location_name && ` · ${row.location_name}`}
                      </p>
                    </div>
                    <p className="text-sm sm:w-60 sm:text-right">
                      <span className="text-muted">{t('products.stockLabel')}: </span>
                      <span className="font-medium">
                        {formatNumber(row.stock)} {row.unit}
                      </span>
                      {low && (
                        <span className="ml-2 whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-danger">
                          {t('products.lowStock')}
                        </span>
                      )}
                    </p>
                    <p className="text-sm sm:w-28 sm:text-right">
                      <span className="text-muted sm:sr-only">{t('products.priceLabel')}: </span>
                      {formatMoney(row.price)}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {hasMore && (
        <Button variant="secondary" onClick={onLoadMore} busy={loading} className="self-center">
          {t('products.loadMore')}
        </Button>
      )}
    </div>
  )
}
