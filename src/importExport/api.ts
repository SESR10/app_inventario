import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportRecord } from './validate'

// Lotes chicos: cada uno es una transacción y el contador de SKU se vuelve lento con lotes enormes.
export const IMPORT_BATCH = 500
const SKU_CHECK_BATCH = 1000
const EXPORT_PAGE = 1000

export async function existingSkus(client: SupabaseClient, companyId: string, skus: string[]) {
  const found = new Set<string>()
  for (let i = 0; i < skus.length; i += SKU_CHECK_BATCH) {
    const { data, error } = await client.rpc('existing_skus', {
      p_company: companyId,
      p_skus: skus.slice(i, i + SKU_CHECK_BATCH),
    })
    if (error) throw error
    for (const sku of (data ?? []) as string[]) found.add(sku.toLowerCase())
  }
  return found
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
}

export async function importBatch(
  client: SupabaseClient,
  companyId: string,
  rows: ImportRecord[],
  updateExisting: boolean,
): Promise<ImportResult> {
  const { data, error } = await client.rpc('import_products', {
    p_company: companyId,
    p_rows: rows,
    p_update_existing: updateExisting,
  })
  if (error) throw error
  return data as ImportResult
}

export interface ExportRow {
  id: string
  sku: string
  name: string
  category: string | null
  unit: string
  cost: number
  price: number
  stock: number
  min_stock: number
  location: string | null
  supplier: string | null
}

// Trae todos los productos por páginas (cursor nombre + id).
export async function exportAll(client: SupabaseClient, companyId: string, onProgress: (count: number) => void) {
  const all: ExportRow[] = []
  let last: ExportRow | null = null
  for (;;) {
    const { data, error } = await client.rpc('export_products', {
      p_company: companyId,
      p_after_name: last?.name ?? null,
      p_after_id: last?.id ?? null,
      p_limit: EXPORT_PAGE,
    })
    if (error) throw error
    const page = (data ?? []) as ExportRow[]
    all.push(...page)
    onProgress(all.length)
    if (page.length < EXPORT_PAGE) return all
    last = page[page.length - 1]
  }
}
