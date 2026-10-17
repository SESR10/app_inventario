// Lectura y escritura de Excel/CSV con SheetJS. Se carga solo al usarla para no pesar en el resto de la app.
const loadXlsx = () => import('xlsx')

export type Cell = string | number | boolean | null

export interface SheetData {
  headers: string[]
  rows: Cell[][]
}

// CSV guardado desde Excel en Windows suele venir en Windows-1252, no en UTF-8.
function decodeText(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

// Lee la primera hoja: la primera fila son los títulos de columna.
export async function readSheet(file: File): Promise<SheetData> {
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const isText = /\.(csv|txt|tsv)$/i.test(file.name)
  const workbook = isText
    ? // raw: deja los textos como están ("1.234,5", "00123"); los números se interpretan al validar.
      XLSX.read(decodeText(buffer), { type: 'string', raw: true, dense: true })
    : XLSX.read(buffer, { type: 'array', dense: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { headers: [], rows: [] }
  const [first = [], ...rows] = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  })
  const width = Math.max(first.length, ...rows.slice(0, 1000).map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => {
    const text = first[i] == null ? '' : String(first[i]).trim()
    return text || XLSX.utils.encode_col(i)
  })
  return { headers, rows }
}

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
