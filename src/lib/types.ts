export type AppRole = 'admin' | 'editor' | 'viewer'

export interface Membership {
  role: AppRole
  company: { id: string; name: string }
}

export const canEdit = (role: AppRole | undefined) => role === 'admin' || role === 'editor'

export type CatalogTable = 'categories' | 'locations' | 'suppliers'

export interface CatalogItem {
  id: string
  name: string
}

// Fila de la lista de productos (función search_products).
export interface ProductRow {
  id: string
  sku: string
  name: string
  unit: string
  price: number
  stock: number
  min_stock: number
  category_name: string | null
  location_name: string | null
}

export interface Product {
  id: string
  company_id: string
  sku: string
  name: string
  unit: string
  cost: number
  price: number
  stock: number
  min_stock: number
  category_id: string | null
  location_id: string | null
  supplier_id: string | null
  image_path: string | null
}

export type ProductInput = Omit<Product, 'id' | 'company_id' | 'sku'> & { sku: string | null }

export const isLowStock = (p: { stock: number; min_stock: number }) => p.min_stock > 0 && p.stock <= p.min_stock
