import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '../lib/client-context'
import type { CatalogItem, CatalogTable } from '../lib/types'
import { listCatalog } from './api'

export type Catalogs = Record<CatalogTable, CatalogItem[]>

const empty: Catalogs = { categories: [], locations: [], suppliers: [] }

// Categorías, ubicaciones y proveedores de la empresa, para filtros y formularios.
export function useCatalogs(companyId: string) {
  const client = useSupabase()
  const [catalogs, setCatalogs] = useState<Catalogs>(empty)

  const fetchAll = useCallback(
    () =>
      Promise.all([
        listCatalog(client, 'categories', companyId),
        listCatalog(client, 'locations', companyId),
        listCatalog(client, 'suppliers', companyId),
      ]),
    [client, companyId],
  )

  useEffect(() => {
    let active = true
    fetchAll()
      .then(([categories, locations, suppliers]) => {
        if (active) setCatalogs({ categories, locations, suppliers })
      })
      .catch(() => {
        // Sin catálogos los filtros quedan vacíos; la lista sigue funcionando.
      })
    return () => {
      active = false
    }
  }, [fetchAll])

  const add = useCallback((table: CatalogTable, item: CatalogItem) => {
    setCatalogs((prev) => ({
      ...prev,
      [table]: [...prev[table], item].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }))
  }, [])

  return { catalogs, add }
}
