import { parseNumber } from '../lib/format'
import { normalizeUnit } from '../products/units'
import { FIELDS, MAX_LENGTH, NUMBER_FIELDS, type FieldKey, type Mapping } from './fields'
import type { Cell } from './sheet'

export type Problem = 'nameRequired' | 'number' | 'negative' | 'tooLong' | 'duplicateInFile' | 'packageIncomplete' | 'positive'

export interface Issue {
  // Número de fila tal como se ve en Excel.
  row: number
  // Posición en las filas leídas y columna del archivo, para corregir el dato en pantalla (null si no hay columna).
  index: number
  column: number | null
  field: FieldKey
  problem: Problem
  value: string
}

// Fila lista para enviar: null = la columna no viene o está vacía. extra: otras columnas guardadas por título.
export type ImportRecord = Record<FieldKey, string | number | null> & {
  extra?: Record<string, string | number>
  // Presentaciones además de la columna Presentación (por ejemplo Caja y Pieza leídas del nombre).
  packages?: { name: string; factor: number }[]
}

export interface ReviewOptions {
  // Fila de Excel de la primera fila de datos (2 si los títulos están en la fila 1).
  firstRow?: number
  // Columnas que no son un dato de la app pero se guardan en el producto, con su título.
  extraColumns?: { column: number; title: string }[]
  // Filas con un solo texto ("PINTURAS") son la categoría de los productos que siguen.
  categoryRows?: boolean
  // Lee la caja del nombre de productos en m² ("PARED 30*60 - 1.62 - 9": caja de 1,62 m² con 9 piezas)
  // y crea las presentaciones con estos nombres.
  boxFromName?: { box: string; piece: string } | null
}

export interface Review {
  toCreate: ImportRecord[]
  toUpdate: ImportRecord[]
  skipped: number
  issues: Issue[]
  rowsWithErrors: number
  // Filas de categoría y de totales que no son productos.
  categories: number
  ignored: number
}

// Textos sin letras ni números ("  -   -  : :", ".") son celdas vacías de programas contables.
const cellText = (cell: Cell | undefined) => {
  const text = cell == null ? '' : String(cell).trim()
  return /[\p{L}\p{N}]/u.test(text) ? text : ''
}

const MAX_EXTRA_TEXT = 500

function cellNumber(cell: Cell | undefined): number | null | 'invalid' {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 'invalid'
  // Acepta "$ 1.500", "COP 12.000" o "€12,5" (quita la moneda) y "12 und" o "1,44 m²" (quita la unidad).
  const text = cellText(cell)
    .replace(/[$€£]|\b(cop|usd|us)\b/gi, '')
    .trim()
  if (!text) return null
  const withUnit = text.match(/^(-?[\d.,\s]*\d)\s*[a-záéíóúñ²³.]+$/i)
  return parseNumber(withUnit ? withUnit[1] : text) ?? 'invalid'
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// Una fila de categoría tiene un solo texto y nada más, por ejemplo "PINTURAS".
function categoryTitle(cells: Cell[]) {
  const filled = cells.filter((c) => cellText(c) !== '')
  if (filled.length !== 1 || typeof filled[0] !== 'string') return null
  const text = cellText(filled[0])
  return text.length <= 80 && cellNumber(text) === 'invalid' ? text : null
}

// "PARED GARDA 30*60 - 1.62 - 9", "PISO 60*60 1.8-5" o "PORCEL 60*60 -1.44 -4 - DG": m² por caja y piezas
// por caja al final del nombre (a veces seguidos de la marca). Si el nombre trae la medida de la pieza
// ("30*60" en cm), se usa para comprobar la cuenta y para leer también el orden piezas - m².
const BOX_IN_NAME = new RegExp(
  String.raw`(?:^|[\s-])(\d*[.,]?\d+)\s*-\s*(\d*[.,]?\d+)\s*(?:unds?|pzs?|piezas)?\s*(?:-?\s*[a-zñ.]+(?:\s+[a-zñ.]+)*\s*)?$`,
  'i',
)
const PIECE_SIZE = /(\d+(?:[.,]\d+)?)\s*[*x]\s*(\d+(?:[.,]\d+)?)/i
const toNumber = (text: string) => Number(text.replace(',', '.'))

export function boxInName(name: string) {
  const match = name.match(BOX_IN_NAME)
  if (!match) return null
  const [first, second] = [toNumber(match[1]), toNumber(match[2])]
  const size = name.match(PIECE_SIZE)
  // Medidas menores que 10 están en metros ("60*1.20" es 60 cm por 1,20 m).
  const pieceArea = size
    ? [size[1], size[2]].map(toNumber).map((v) => (v < 10 ? v * 100 : v)).reduce((x, y) => x * y) / 10000
    : null
  const options = [{ area: first, pieces: second }, ...(size ? [{ area: second, pieces: first }] : [])].filter(
    ({ area, pieces }) => area > 0 && area <= 20 && Number.isInteger(pieces) && pieces >= 1 && pieces <= 500,
  )
  if (pieceArea === null) return options[0] ?? null
  return options.find(({ area, pieces }) => Math.abs(area / pieces - pieceArea) <= pieceArea * 0.2) ?? null
}

// Cuántas filas en m² traen la caja en el nombre (para ofrecer la opción solo si hay).
export function countBoxesInNames(rows: Cell[][], mapping: Mapping) {
  if (mapping.name === null || mapping.unit === null) return 0
  return rows.filter(
    (r) => normalizeUnit(cellText(r[mapping.unit!])) === 'm²' && boxInName(cellText(r[mapping.name!])) !== null,
  ).length
}

// Cuántas celdas con dato y cuántos valores distintos tiene una columna (en las primeras 5000 filas).
export function columnStats(rows: Cell[][], column: number) {
  const values = new Set<string>()
  let filled = 0
  for (const r of rows.slice(0, 5000)) {
    const text = r[column] === false ? '' : cellText(r[column])
    if (!text) continue
    filled++
    values.add(text)
  }
  // Columna "con datos": algo distinto de vacío o de puros ceros.
  const useful = filled > 0 && !(values.size === 1 && values.has('0'))
  return { filled, distinct: values.size, useful }
}

// Cuántas filas parecen títulos de categoría (para ofrecer la opción solo si hay).
export const countCategoryRows = (rows: Cell[][]) => rows.filter((r) => categoryTitle(r) !== null).length

// Filas de totales al final o entre grupos: "TOTAL", "Subtotal pinturas".
const isTotalRow = (cells: Cell[]) => {
  const first = cells.find((c) => typeof c === 'string' && c.trim() !== '')
  return typeof first === 'string' && /^(sub|gran)?\s*total(es)?\b/.test(normalize(first.trim()))
}

// SKU que hay que consultar en la base para saber si el producto ya existe.
export function skusInFile(rows: Cell[][], mapping: Mapping) {
  const column = mapping.sku
  if (column == null) return []
  return [...new Set(rows.map((r) => cellText(r[column])).filter(Boolean))]
}

// Revisa cada fila y separa productos nuevos, a actualizar, omitidos y errores.
// `existing`: SKU que ya están en la empresa, en minúsculas.
export function reviewRows(
  rows: Cell[][],
  mapping: Mapping,
  existing: Set<string>,
  updateExisting: boolean,
  { firstRow = 2, extraColumns = [], categoryRows = false, boxFromName = null }: ReviewOptions = {},
): Review {
  const review: Review = {
    toCreate: [], toUpdate: [], skipped: 0, issues: [], rowsWithErrors: 0, categories: 0, ignored: 0,
  }
  const seenSkus = new Set<string>()
  let category: string | null = null

  rows.forEach((cells, index) => {
    const row = firstRow + index
    const record = {} as ImportRecord
    const issues: Issue[] = []
    let empty = true
    const issue = (field: FieldKey, problem: Problem, value: string) =>
      issues.push({ row, index, column: mapping[field], field, problem, value })

    if (categoryRows) {
      const title = categoryTitle(cells)
      if (title) {
        category = title
        review.categories++
        return
      }
    }
    if (isTotalRow(cells)) {
      review.ignored++
      return
    }

    for (const field of FIELDS) {
      const column = mapping[field]
      const cell = column == null ? null : cells[column]
      const text = cellText(cell)
      if (text) empty = false

      if (NUMBER_FIELDS.includes(field)) {
        const value = cellNumber(cell)
        if (value === 'invalid') issue(field, 'number', text)
        else if (value !== null && value < 0) issue(field, 'negative', text)
        record[field] = value === 'invalid' ? null : value
      } else {
        const max = MAX_LENGTH[field]
        if (max && text.length > max) issue(field, 'tooLong', text)
        record[field] = (field === 'unit' && text ? normalizeUnit(text) : text) || null
      }
    }
    if (empty) return
    if (!record.category && category) record.category = category

    const extra: Record<string, string | number> = {}
    for (const { column, title } of extraColumns) {
      const cell = cells[column]
      if (typeof cell === 'number' && Number.isFinite(cell)) extra[title] = cell
      else if (typeof cell === 'boolean') extra[title] = cell ? 'Sí' : 'No'
      else if (cellText(cell)) extra[title] = cellText(cell).slice(0, MAX_EXTRA_TEXT)
    }
    if (Object.keys(extra).length > 0) record.extra = extra

    const box = boxFromName && record.unit === 'm²' && typeof record.name === 'string' ? boxInName(record.name) : null
    if (box) {
      record.packages = [
        { name: boxFromName!.box, factor: box.area },
        { name: boxFromName!.piece, factor: Math.round((box.area / box.pieces) * 1e6) / 1e6 },
      ]
    }

    const sku = typeof record.sku === 'string' ? record.sku.toLowerCase() : null
    if (sku && seenSkus.has(sku)) issue('sku', 'duplicateInFile', String(record.sku))
    if (sku) seenSkus.add(sku)

    const exists = sku !== null && existing.has(sku)
    // Un producto nuevo necesita nombre; uno existente puede actualizarse solo con algunas columnas.
    if (!exists && !record.name) issue('name', 'nameRequired', '')
    // Presentación: nombre y contenido van juntos, y el contenido es mayor que 0.
    if (record.package_factor === 0) issue('package_factor', 'positive', '0')
    else if (!record.package_name !== (record.package_factor === null)) {
      issue(record.package_name ? 'package_factor' : 'package_name', 'packageIncomplete', '')
    }

    if (issues.length > 0) {
      review.issues.push(...issues)
      review.rowsWithErrors++
    } else if (!exists) review.toCreate.push(record)
    else if (updateExisting) review.toUpdate.push(record)
    else review.skipped++
  })

  return review
}
