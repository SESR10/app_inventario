import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogItem, CatalogTable, Product, ProductInput, ProductRow } from '../lib/types'

export const PAGE_SIZE = 50
export const IMAGE_BUCKET = 'product-images'
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
// Etiquetas por impresión.
export const MAX_LABELS = 200

export interface ProductFilters {
  query: string
  categoryId: string
  locationId: string
  supplierId: string
  lowStock: boolean
}

export const emptyFilters: ProductFilters = { query: '', categoryId: '', locationId: '', supplierId: '', lowStock: false }

function filterParams(companyId: string, f: ProductFilters) {
  return {
    p_company: companyId,
    p_query: f.query.trim() || null,
    p_category: f.categoryId || null,
    p_location: f.locationId || null,
    p_supplier: f.supplierId || null,
    p_low_stock: f.lowStock,
  }
}

// Siguiente página después de `after` (paginación por cursor nombre + id).
export async function searchProducts(
  client: SupabaseClient,
  companyId: string,
  filters: ProductFilters,
  after: ProductRow | null,
): Promise<ProductRow[]> {
  const { data, error } = await client.rpc('search_products', {
    ...filterParams(companyId, filters),
    p_after_name: after?.name ?? null,
    p_after_id: after?.id ?? null,
    p_limit: PAGE_SIZE,
  })
  if (error) throw error
  return (data ?? []) as ProductRow[]
}

export async function countProducts(client: SupabaseClient, companyId: string, filters: ProductFilters) {
  const { data, error } = await client.rpc('count_products', filterParams(companyId, filters))
  if (error) throw error
  return Number(data)
}

export async function getProduct(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('products').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Product | null
}

export async function getProductsByIds(client: SupabaseClient, ids: string[]) {
  const { data, error } = await client.from('products').select('id, sku, name, price, unit').in('id', ids)
  if (error) throw error
  const rows = (data ?? []) as Pick<Product, 'id' | 'sku' | 'name' | 'price' | 'unit'>[]
  // Respeta el orden en que se eligieron.
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r) => r !== undefined)
}

export async function saveProduct(client: SupabaseClient, companyId: string, input: ProductInput, id?: string) {
  const query = id
    ? client.from('products').update(input).eq('id', id)
    : client.from('products').insert({ ...input, company_id: companyId })
  const { data, error } = await query.select('id, sku').single()
  if (error) throw error
  return data as { id: string; sku: string }
}

export async function deleteProduct(client: SupabaseClient, product: Pick<Product, 'id' | 'image_path'>) {
  const { error } = await client.from('products').delete().eq('id', product.id)
  if (error) throw error
  if (product.image_path) await client.storage.from(IMAGE_BUCKET).remove([product.image_path])
}

export async function listCatalog(client: SupabaseClient, table: CatalogTable, companyId: string) {
  const { data, error } = await client.from(table).select('id, name').eq('company_id', companyId).order('name')
  if (error) throw error
  return (data ?? []) as CatalogItem[]
}

export async function createCatalogItem(client: SupabaseClient, table: CatalogTable, companyId: string, name: string) {
  const { data, error } = await client
    .from(table)
    .insert({ company_id: companyId, name: name.trim() })
    .select('id, name')
    .single()
  if (error) throw error
  return data as CatalogItem
}

export async function uploadImage(client: SupabaseClient, companyId: string, file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await client.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}

export async function imageUrl(client: SupabaseClient, path: string) {
  const { data, error } = await client.storage.from(IMAGE_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

// Código duplicado de Postgres: SKU repetido dentro de la empresa.
export const isDuplicateError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
