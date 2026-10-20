// Columnas del archivo de productos, en el orden de la plantilla y la exportación.
export const FIELDS = [
  'sku', 'name', 'category', 'unit', 'cost', 'price', 'stock', 'min_stock', 'location', 'supplier',
  'package_name', 'package_factor',
] as const

export type FieldKey = (typeof FIELDS)[number]

export const NUMBER_FIELDS: readonly FieldKey[] = ['cost', 'price', 'stock', 'min_stock', 'package_factor']

// Largo máximo de cada texto (igual que en la base de datos).
export const MAX_LENGTH: Partial<Record<FieldKey, number>> = {
  sku: 64,
  name: 200,
  category: 80,
  unit: 40,
  location: 80,
  supplier: 120,
  package_name: 40,
}

// Nombres de columna que se reconocen solos al mapear (sin tildes, espacios ni mayúsculas).
// Incluye cómo suelen titularse en los Excel de los negocios: "Ref.", "Vr. unitario", "Cant.", "Existencia".
const SYNONYMS: Record<FieldKey, string[]> = {
  sku: [
    'sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'codigointerno', 'codproducto', 'codigoproducto', 'plu', 'codigoarticulo', 'codart', 'idproducto',
  ],
  name: [
    'nombre', 'name', 'producto', 'product', 'descripcion', 'description', 'articulo', 'detalle', 'nombreproducto',
    'descripciondelproducto', 'desc', 'nom',
  ],
  category: [
    'categoria', 'category', 'familia', 'grupo', 'linea', 'clase', 'departamento', 'seccion', 'subgrupo', 'grpnom',
    'gruponom', 'nomgrupo', 'nombregrupo', 'linnom', 'famnom', 'catnom',
  ],
  unit: ['unidad', 'unit', 'um', 'und', 'unid', 'udm', 'unidaddemedida', 'medida', 'uom'],
  cost: [
    'costo', 'cost', 'coste', 'preciodecompra', 'preciocompra', 'costounitario', 'vrcompra', 'valorcompra',
    'valordecompra', 'costopromedio', 'ultimocosto', 'preciocosto', 'vrcosto', 'valorcosto', 'costounit',
  ],
  price: [
    'precio', 'price', 'preciodeventa', 'precioventa', 'pvp', 'valor', 'vrunitario', 'valorunitario', 'vrventa',
    'valorventa', 'preciopublico', 'precioalpublico', 'pventa', 'preciounitario', 'vrunit', 'precio1', 'valorunit',
  ],
  stock: [
    'stock', 'stockactual', 'existencias', 'existencia', 'cantidad', 'qty', 'quantity', 'inventario', 'cant', 'saldo',
    'disponible', 'unidades', 'saldoactual', 'saldofinal', 'inventarioactual', 'cantidadactual', 'exist',
  ],
  min_stock: [
    'stockminimo', 'minimo', 'min', 'minstock', 'stockmin', 'cantidadminima', 'puntodereorden', 'reorden',
    'inventariominimo', 'existenciaminima',
  ],
  location: ['ubicacion', 'location', 'bodega', 'almacen', 'estante', 'pasillo', 'sede', 'ubic'],
  supplier: ['proveedor', 'supplier', 'vendor', 'fabricante', 'provnom', 'nomprov'],
  package_name: ['presentacion', 'empaque', 'embalaje', 'package', 'packaging'],
  package_factor: [
    'contenidoporpresentacion', 'contenido', 'contenidoporcaja', 'unidadesporcaja', 'cantidadporcaja',
    'unidadesporempaque', 'factor', 'equivalencia', 'undxcaja', 'unidadesxcaja', 'cantxcaja',
  ],
}

// Títulos que nunca son el dato aunque lo contengan: "Valor total" no es el precio, "Código de barras" no es el SKU.
const NEVER = ['total', 'descuento', 'barras', 'ean', 'utilidad', 'margen', 'porcentaje']
// Precios con impuesto: se usan solo si no hay otra columna de precio o costo.
const WITH_TAX = ['iva', 'impuesto', 'imp']

export const normalizeHeader = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export type Mapping = Record<FieldKey, number | null>

// Propone qué columna del archivo corresponde a cada campo: primero títulos exactos
// ("Precio"), luego títulos que contienen el nombre ("Nombre del producto").
// Programas contables titulan las columnas con un prefijo de tabla: "procod", "pronom", "pround".
// Si la mayoría de títulos comparte un prefijo de 2 a 4 letras, se compara también sin él.
function commonPrefix(normalized: string[]) {
  const titles = normalized.filter(Boolean)
  for (const size of [4, 3, 2]) {
    const counts = new Map<string, number>()
    for (const h of titles) if (h.length > size + 1) counts.set(h.slice(0, size), (counts.get(h.slice(0, size)) ?? 0) + 1)
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] >= 4 && best[1] >= titles.length * 0.4) return best[0]
  }
  return null
}

// `filled`: si se sabe, qué columnas tienen datos; las vacías no se proponen.
export function guessMapping(headers: string[], filled?: boolean[]): Mapping {
  const normalized = headers.map(normalizeHeader)
  const prefix = commonPrefix(normalized)
  // Cada título se compara tal cual y, si tiene el prefijo común, también sin él.
  const variants = normalized.map((h) =>
    prefix && h.startsWith(prefix) && h.length > prefix.length + 1 ? [h, h.slice(prefix.length)] : [h],
  )
  const never = (h: string) => NEVER.some((n) => h.includes(n))
  const withTax = (h: string) => WITH_TAX.some((n) => h.endsWith(n) || h.includes('con' + n))
  const used = new Set<number>(
    normalized.flatMap((h, i) => (never(h) || withTax(h) || filled?.[i] === false ? [i] : [])),
  )
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping
  const exact = (h: string, s: string) => h === s
  const contains = (h: string, s: string) => s.length >= 5 && h.includes(s)
  // "Vr. unit. venta", "Cant. disponible": títulos que empiezan con una abreviatura conocida.
  const startsWith = (h: string, s: string) => s.length >= 3 && h.startsWith(s)

  const pass = (matches: (h: string, s: string) => boolean, fields: readonly FieldKey[]) => {
    for (const field of fields) {
      if (mapping[field] !== null) continue
      const index = variants.findIndex(
        (forms, i) => !used.has(i) && forms.some((h) => SYNONYMS[field].some((s) => matches(h, s))),
      )
      if (index >= 0) {
        mapping[field] = index
        used.add(index)
      }
    }
  }
  for (const matches of [exact, contains, startsWith]) pass(matches, FIELDS)
  // Si no hubo precio o costo sin impuesto, sirve el que lo incluye.
  normalized.forEach((h, i) => withTax(h) && !never(h) && filled?.[i] !== false && used.delete(i))
  pass(contains, ['price', 'cost'])
  return mapping
}

// Fila donde están los títulos: la que más títulos conocidos tiene entre las primeras 30
// (arriba suele haber logo, nombre de la empresa, fecha o filas vacías).
export function detectHeaderRow(cells: unknown[][]): { row: number; score: number } {
  let best = { row: -1, score: 0 }
  cells.slice(0, 30).forEach((cellsInRow, row) => {
    const texts = cellsInRow.map((c) => (typeof c === 'string' ? c : ''))
    const mapping = guessMapping(texts)
    const score = Object.values(mapping).filter((v) => v !== null).length
    if (score > best.score) best = { row, score }
  })
  if (best.score >= 2) return best
  // Sin títulos conocidos: la primera fila con al menos dos textos.
  const row = cells.slice(0, 30).findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2)
  return { row: Math.max(row, 0), score: best.score }
}

// Títulos abreviados frecuentes en programas contables, para proponer un nombre claro a los "Otros datos".
const FRIENDLY: Record<string, string> = {
  marnom: 'brand', marca: 'brand', subnom: 'subgroup', subgrupo: 'subgroup', grpnom: 'group', peso: 'weight',
  ultcom: 'lastPurchase', ultvta: 'lastSale', ultcto: 'lastCost', ultcomv: 'lastPurchaseValue', grpcod: 'groupCode',
  subcod: 'subgroupCode', codbar: 'barcode', ean: 'barcode', ean13: 'barcode', inact: 'inactive', refe: 'reference',
}

// Clave de traducción del nombre claro de una columna ("marnom" → brand), o null si no se conoce.
export function friendlyKey(header: string, headers: string[]) {
  const h = normalizeHeader(header)
  const prefix = commonPrefix(headers.map(normalizeHeader))
  const stripped = prefix && h.startsWith(prefix) ? h.slice(prefix.length) : h
  return FRIENDLY[stripped] ?? FRIENDLY[h] ?? null
}
