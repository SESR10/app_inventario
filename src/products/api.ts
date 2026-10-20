import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogItem, CatalogTable, KitComponent, Product, ProductInput, ProductPackage, ProductRow } from '../lib/types'

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

export async function listPackages(client: SupabaseClient, productId: string) {
  const { data, error } = await client
    .from('product_packages')
    .select('id, name, factor, barcode')
    .eq('product_id', productId)
    .order('factor')
  if (error) throw error
  return ((data ?? []) as ProductPackage[]).map((p) => ({ ...p, factor: Number(p.factor) }))
}

// Presentaciones de varios productos (para etiquetas).
export async function listPackagesOf(client: SupabaseClient, productIds: string[]) {
  const { data, error } = await client
    .from('product_packages')
    .select('id, product_id, name, factor, barcode')
    .in('product_id', productIds)
    .order('factor')
  if (error) throw error
  return ((data ?? []) as (ProductPackage & { product_id: string })[]).map((p) => ({ ...p, factor: Number(p.factor) }))
}

// Guarda la lista completa de presentaciones (las que faltan se borran). Sin id = nueva.
export async function savePackages(
  client: SupabaseClient,
  productId: string,
  packages: { id?: string; name: string; factor: number; barcode: string | null }[],
) {
  const { error } = await client.rpc('set_product_packages', { p_product: productId, p_packages: packages })
  if (error) throw error
}

export async function listKitComponents(client: SupabaseClient, kitId: string): Promise<KitComponent[]> {
  const { data, error } = await client.from('kit_components').select('component_id, quantity').eq('kit_id', kitId)
  if (error) throw error
  const rows = (data ?? []) as { component_id: string; quantity: number }[]
  if (rows.length === 0) return []
  const { data: products, error: productsError } = await client
    .from('products')
    .select('id, name, sku, unit, stock')
    .in('id', rows.map((r) => r.component_id))
  if (productsError) throw productsError
  const byId = new Map(((products ?? []) as Pick<Product, 'id' | 'name' | 'sku' | 'unit' | 'stock'>[]).map((p) => [p.id, p]))
  return rows
    .filter((r) => byId.has(r.component_id))
    .map((r) => {
      const p = byId.get(r.component_id)!
      return { component_id: r.component_id, quantity: Number(r.quantity), name: p.name, sku: p.sku, unit: p.unit, stock: Number(p.stock) }
    })
}

export async function saveKitComponents(
  client: SupabaseClient,
  kitId: string,
  components: { component_id: string; quantity: number }[],
) {
  const { error } = await client.rpc('set_kit_components', { p_kit: kitId, p_components: components })
  if (error) throw error
}

// Producto (y presentación) de un código escaneado: SKU o código de una presentación.
export async function findCode(client: SupabaseClient, companyId: string, code: string) {
  const { data, error } = await client.rpc('find_code', { p_company: companyId, p_code: code })
  if (error) throw error
  const row = ((data ?? []) as { product_id: string; package_id: string | null }[])[0]
  return row ?? null
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

// Pieza que no se puede borrar porque está en un kit (clave foránea).
export const isInUseError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'

// Código duplicado de Postgres: SKU repetido dentro de la empresa.
export const isDuplicateError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
