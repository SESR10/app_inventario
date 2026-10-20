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
  is_kit: boolean
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
  // Kit: se arma con otras piezas; su stock es cuántos kits se pueden armar.
  is_kit: boolean
  // Otras columnas del Excel de la empresa, guardadas por su título ("Marca": "Stanley").
  extra?: Record<string, string | number>
}

// Presentación de un producto: cuántas unidades base trae (Caja = 1,44 m²).
export interface ProductPackage {
  id: string
  name: string
  factor: number
  barcode: string
}

// Pieza de un kit, con los datos del producto para mostrarla.
export interface KitComponent {
  component_id: string
  quantity: number
  name: string
  sku: string
  unit: string
  stock: number
}

// Al editar no se envía el stock: cambia solo con movimientos.
export type ProductInput = Omit<Product, 'id' | 'company_id' | 'sku' | 'stock' | 'is_kit' | 'extra'> & {
  sku: string | null
  stock?: number
  is_kit?: boolean
}

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
  // Presentación en que se registró ("10 Caja") y kit del que vino, si aplica.
  package_name: string | null
  package_qty: number | null
  kit_name: string | null
  kit_qty: number | null
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
