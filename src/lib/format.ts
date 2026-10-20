const numberFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 3 })
const moneyFormat = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatNumber = (value: number) => numberFormat.format(value)
export const formatMoney = (value: number) => moneyFormat.format(value)

// Acepta "1.234,5", "1234.5" o "1234,5". Devuelve null si no es un número.
// "1.500" o "12.000" (un solo separador seguido de grupos de 3 cifras) son miles, como se escribe en Colombia.
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '')
  if (!text) return null
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(text) || /^-?[1-9]\d{0,2}(,\d{3})+$/.test(text)) {
    return Number(text.replace(/[.,]/g, ''))
  }
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  const decimalSep = lastComma > lastDot ? ',' : '.'
  const thousandSep = decimalSep === ',' ? '.' : ','
  const normalized = text.split(thousandSep).join('').replace(decimalSep, '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}
