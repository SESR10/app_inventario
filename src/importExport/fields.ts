// Columnas del archivo de productos, en el orden de la plantilla y la exportación.
export const FIELDS = ['sku', 'name', 'category', 'unit', 'cost', 'price', 'stock', 'min_stock', 'location', 'supplier'] as const

export type FieldKey = (typeof FIELDS)[number]

export const NUMBER_FIELDS: readonly FieldKey[] = ['cost', 'price', 'stock', 'min_stock']

// Largo máximo de cada texto (igual que en la base de datos).
export const MAX_LENGTH: Partial<Record<FieldKey, number>> = {
  sku: 64,
  name: 200,
  category: 80,
  unit: 40,
  location: 80,
  supplier: 120,
}

// Nombres de columna que se reconocen solos al mapear (sin tildes, espacios ni mayúsculas).
const SYNONYMS: Record<FieldKey, string[]> = {
  sku: ['sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'codigointerno'],
  name: ['nombre', 'name', 'producto', 'product', 'descripcion', 'description', 'articulo'],
  category: ['categoria', 'category', 'familia', 'grupo', 'linea'],
  unit: ['unidad', 'unit', 'um', 'unidaddemedida', 'medida'],
  cost: ['costo', 'cost', 'coste', 'preciodecompra', 'preciocompra', 'costounitario'],
  price: ['precio', 'price', 'preciodeventa', 'precioventa', 'pvp', 'valor'],
  stock: ['stock', 'stockactual', 'existencias', 'existencia', 'cantidad', 'qty', 'quantity', 'inventario'],
  min_stock: ['stockminimo', 'minimo', 'min', 'minstock', 'stockmin', 'cantidadminima'],
  location: ['ubicacion', 'location', 'bodega', 'almacen', 'estante'],
  supplier: ['proveedor', 'supplier', 'vendor', 'fabricante'],
}

export const normalizeHeader = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export type Mapping = Record<FieldKey, number | null>

// Propone qué columna del archivo corresponde a cada campo: primero títulos exactos
// ("Precio"), luego títulos que contienen el nombre ("Nombre del producto").
export function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeader)
  const used = new Set<number>()
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping
  const matchers = [
    (h: string, s: string) => h === s,
    (h: string, s: string) => s.length >= 5 && h.includes(s),
  ]
  for (const matches of matchers) {
    for (const field of FIELDS) {
      if (mapping[field] !== null) continue
      const index = normalized.findIndex((h, i) => !used.has(i) && SYNONYMS[field].some((s) => matches(h, s)))
      if (index >= 0) {
        mapping[field] = index
        used.add(index)
      }
    }
  }
  return mapping
}
