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

// Al editar no se envía el stock: cambia solo con movimientos.
export type ProductInput = Omit<Product, 'id' | 'company_id' | 'sku' | 'stock'> & { sku: string | null; stock?: number }

export const isLowStock = (p: { stock: number; min_stock: number }) => p.min_stock > 0 && p.stock <= p.min_stock

export type MovementType = 'in' | 'out' | 'adjust'

// Fila del historial (función list_movements).
export interface Movement {
  id: number
  created_at: string
  type: MovementType
  quantity: number
  stock_after: number
  reason: string | null
  product_id: string
  product_name: string
  product_sku: string
  unit: string
  user_email: string | null
}

export interface TeamMember {
  user_id: string
  email: string
  role: AppRole
  created_at: string
}

export interface Invitation {
  email: string
  role: AppRole
  created_at: string
}
