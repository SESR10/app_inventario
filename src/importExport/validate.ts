import { parseNumber } from '../lib/format'
import { FIELDS, MAX_LENGTH, NUMBER_FIELDS, type FieldKey, type Mapping } from './fields'
import type { Cell } from './sheet'

export type Problem = 'nameRequired' | 'number' | 'negative' | 'tooLong' | 'duplicateInFile' | 'packageIncomplete' | 'positive'

export interface Issue {
  // Número de fila tal como se ve en Excel (la fila 1 son los títulos).
  row: number
  field: FieldKey
  problem: Problem
  value: string
}

// Fila lista para enviar: null = la columna no viene o está vacía.
export type ImportRecord = Record<FieldKey, string | number | null>

export interface Review {
  toCreate: ImportRecord[]
  toUpdate: ImportRecord[]
  skipped: number
  issues: Issue[]
  rowsWithErrors: number
}

const cellText = (cell: Cell | undefined) => (cell == null ? '' : String(cell).trim())

function cellNumber(cell: Cell | undefined): number | null | 'invalid' {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 'invalid'
  // Acepta "$ 1.500" o "€12,5": quita el símbolo de moneda.
  const text = cellText(cell).replace(/[$€£]/g, '')
  if (!text) return null
  return parseNumber(text) ?? 'invalid'
}

// SKU que hay que consultar en la base para saber si el producto ya existe.
export function skusInFile(rows: Cell[][], mapping: Mapping) {
  const column = mapping.sku
  if (column == null) return []
  return [...new Set(rows.map((r) => cellText(r[column])).filter(Boolean))]
}

// Revisa cada fila y separa productos nuevos, a actualizar, omitidos y errores.
// `existing`: SKU que ya están en la empresa, en minúsculas.
export function reviewRows(rows: Cell[][], mapping: Mapping, existing: Set<string>, updateExisting: boolean): Review {
  const review: Review = { toCreate: [], toUpdate: [], skipped: 0, issues: [], rowsWithErrors: 0 }
  const seenSkus = new Set<string>()

  rows.forEach((cells, index) => {
    const row = index + 2
    const record = {} as ImportRecord
    const issues: Issue[] = []
    let empty = true

    for (const field of FIELDS) {
      const column = mapping[field]
      const cell = column == null ? null : cells[column]
      const text = cellText(cell)
      if (text) empty = false

      if (NUMBER_FIELDS.includes(field)) {
        const value = cellNumber(cell)
        if (value === 'invalid') issues.push({ row, field, problem: 'number', value: text })
        else if (value !== null && value < 0) issues.push({ row, field, problem: 'negative', value: text })
        record[field] = value === 'invalid' ? null : value
      } else {
        const max = MAX_LENGTH[field]
        if (max && text.length > max) issues.push({ row, field, problem: 'tooLong', value: text })
        record[field] = text || null
      }
    }
    if (empty) return

    const sku = typeof record.sku === 'string' ? record.sku.toLowerCase() : null
    if (sku && seenSkus.has(sku)) issues.push({ row, field: 'sku', problem: 'duplicateInFile', value: String(record.sku) })
    if (sku) seenSkus.add(sku)

    const exists = sku !== null && existing.has(sku)
    // Un producto nuevo necesita nombre; uno existente puede actualizarse solo con algunas columnas.
    if (!exists && !record.name) issues.push({ row, field: 'name', problem: 'nameRequired', value: '' })
    // Presentación: nombre y contenido van juntos, y el contenido es mayor que 0.
    if (record.package_factor === 0) issues.push({ row, field: 'package_factor', problem: 'positive', value: '0' })
    else if (!record.package_name !== (record.package_factor === null)) {
      const field = record.package_name ? 'package_factor' : 'package_name'
      issues.push({ row, field, problem: 'packageIncomplete', value: '' })
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
