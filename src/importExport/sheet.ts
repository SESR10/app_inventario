// Lectura y escritura de Excel/CSV con SheetJS. Se carga solo al usarla para no pesar en el resto de la app.
const loadXlsx = () => import('xlsx')

export type Cell = string | number | boolean | null

export interface SheetData {
  headers: string[]
  rows: Cell[][]
  // Número de fila en Excel de rows[0] (para mostrar errores con la fila que ve la persona).
  firstRow: number
}

export interface WorkbookSheet {
  name: string
  // Todas las filas desde A1, incluidas las vacías, para que el índice + 1 sea la fila de Excel.
  cells: Cell[][]
}

export const columnLetter = (index: number) => {
  let letter = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  return letter
}

// Fechas como texto día/mes/año; "21-Feb-22 00:00:00" pierde la hora vacía.
const dateText = (cell: Cell | Date): Cell => {
  if (cell instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(cell.getDate())}/${pad(cell.getMonth() + 1)}/${cell.getFullYear()}`
  }
  return typeof cell === 'string' ? cell.replace(/\s+00:00(:00)?$/, '') : cell
}

const isEmptyRow = (row: Cell[]) => row.every((c) => c == null || String(c).trim() === '')

// CSV guardado desde Excel en Windows suele venir en Windows-1252, no en UTF-8.
function decodeText(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

// Lee todas las hojas del archivo.
export async function readWorkbook(file: File): Promise<WorkbookSheet[]> {
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const isText = /\.(csv|txt|tsv)$/i.test(file.name)
  const workbook = isText
    ? // raw: deja los textos como están ("1.234,5", "00123"); los números se interpretan al validar.
      XLSX.read(decodeText(buffer), { type: 'string', raw: true, dense: true })
    : XLSX.read(buffer, { type: 'array', dense: true, cellDates: true })
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet?.['!ref']) return []
    // Desde A1 aunque la hoja empiece más abajo, así las filas y columnas coinciden con Excel.
    const range = XLSX.utils.decode_range(sheet['!ref'])
    range.s = { r: 0, c: 0 }
    sheet['!ref'] = XLSX.utils.encode_range(range)
    const cells = XLSX.utils
      .sheet_to_json<(Cell | Date)[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true })
      .map((row) => row.map(dateText))
    while (cells.length > 0 && isEmptyRow(cells[cells.length - 1])) cells.pop()
    return cells.length > 0 ? [{ name, cells }] : []
  })
}

// Separa títulos y filas a partir de la fila de títulos (índice desde 0).
export function sheetData(cells: Cell[][], headerRow: number): SheetData {
  const first = cells[headerRow] ?? []
  const rows = cells.slice(headerRow + 1)
  const width = Math.max(first.length, ...rows.slice(0, 1000).map((r) => r.length))
  const seen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, i) => {
    const text = (first[i] == null ? '' : String(first[i]).replace(/\s+/g, ' ').trim()) || columnLetter(i)
    // Títulos repetidos ("Precio", "Precio") se distinguen por su columna.
    const key = text.toLowerCase()
    seen.set(key, (seen.get(key) ?? 0) + 1)
    return seen.get(key)! > 1 ? `${text} (${columnLetter(i)})` : text
  })
  return { headers, rows, firstRow: headerRow + 2 }
}

export const countRowsWithData = (rows: Cell[][]) => rows.filter((r) => !isEmptyRow(r)).length

export interface SheetSpec {
  name: string
  rows: Cell[][]
  widths?: number[]
}

// Crea un .xlsx con una o varias hojas y lo descarga.
export async function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  const XLSX = await loadXlsx()
  const workbook = XLSX.utils.book_new()
  for (const spec of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(spec.rows)
    if (spec.widths) sheet['!cols'] = spec.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(workbook, sheet, spec.name)
  }
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const url = URL.createObjectURL(
    new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const today = () => new Date().toISOString().slice(0, 10)
