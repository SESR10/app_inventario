import { formatNumber } from '../lib/format'
import type { ProductPackage } from '../lib/types'

// Unidades de medida frecuentes, agrupadas. También se puede escribir otra.
export const UNIT_GROUPS = [
  { key: 'count', units: ['unidad', 'par', 'docena', 'juego', 'caja', 'paquete', 'bulto', 'rollo'] },
  { key: 'length', units: ['m', 'cm', 'mm'] },
  { key: 'area', units: ['m²'] },
  { key: 'volume', units: ['m³', 'L', 'mL', 'galón'] },
  { key: 'weight', units: ['kg', 'g', 'lb', 't'] },
] as const

export const KNOWN_UNITS: readonly string[] = UNIT_GROUPS.flatMap((g) => g.units)

// "1 Caja = 1,44 m²"
export const packageEquivalence = (pkg: Pick<ProductPackage, 'name' | 'factor'>, unit: string) =>
  `1 ${pkg.name} = ${formatNumber(pkg.factor)} ${unit}`

// Reparte un stock en sus presentaciones, de la más grande a la más chica:
// 15 m² con Caja = 1,44 y Pieza = 0,18 → 10 Caja, 3 Pieza y 0,06 m².
export function stockBreakdown(stock: number, packages: Pick<ProductPackage, 'name' | 'factor'>[], unit: string) {
  if (packages.length === 0 || stock <= 0) return null
  const parts: string[] = []
  // Se trabaja en milésimas para no arrastrar errores de decimales.
  let rest = Math.round(stock * 1000)
  for (const pkg of [...packages].sort((a, b) => b.factor - a.factor)) {
    const size = Math.round(pkg.factor * 1000)
    if (size <= 0) continue
    const count = Math.floor(rest / size)
    if (count > 0) {
      parts.push(`${formatNumber(count)} ${pkg.name}`)
      rest -= count * size
    }
  }
  if (rest > 0) parts.push(`${formatNumber(rest / 1000)} ${unit}`)
  return parts.length > 0 ? parts : null
}
