import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogTable, KitComponent, Product, ProductPackage } from '../lib/types'
import { findCode, getProduct, imageUrl, listKitComponents, listPackages } from '../products/api'

export interface ScannedProduct {
  product: Product
  // Presentación cuyo código se escaneó (la caja, por ejemplo), si no fue el SKU.
  packageId: string | null
  packages: ProductPackage[]
  components: KitComponent[]
  image: string | null
  category: string | null
  location: string | null
  supplier: string | null
}

async function catalogName(client: SupabaseClient, table: CatalogTable, id: string | null) {
  if (!id) return null
  const { data } = await client.from(table).select('name').eq('id', id).maybeSingle()
  return (data as { name: string } | null)?.name ?? null
}

// Todo lo que se muestra de un código escaneado, en una sola ida y vuelta en paralelo.
export async function lookupCode(client: SupabaseClient, companyId: string, code: string): Promise<ScannedProduct | null> {
  const found = await findCode(client, companyId, code)
  if (!found) return null
  const product = await getProduct(client, found.product_id)
  if (!product) return null
  const [packages, components, image, category, location, supplier] = await Promise.all([
    product.is_kit ? Promise.resolve([]) : listPackages(client, product.id).catch(() => []),
    product.is_kit ? listKitComponents(client, product.id).catch(() => []) : Promise.resolve([]),
    product.image_path ? imageUrl(client, product.image_path).catch(() => null) : Promise.resolve(null),
    catalogName(client, 'categories', product.category_id),
    catalogName(client, 'locations', product.location_id),
    catalogName(client, 'suppliers', product.supplier_id),
  ])
  return {
    product: { ...product, stock: Number(product.stock), min_stock: Number(product.min_stock) },
    packageId: found.package_id,
    packages,
    components,
    image,
    category,
    location,
    supplier,
  }
}
