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

// Cómo suelen escribirse las unidades en los Excel y programas contables ("MTR2", "UND", "KGS").
const UNIT_ALIASES: Record<string, string> = Object.fromEntries(
  (
    [
      ['unidad', 'u un und unid unidad unidades ud uds'],
      ['m²', 'm2 mt2 mtr2 mts2 mtrs2 metro2 metrocuadrado metroscuadrados'],
      ['m³', 'm3 mt3 mtr3 mts3 metro3 metrocubico metroscubicos'],
      ['m', 'm mt mtr mts metro metros'],
      ['cm', 'cm centimetro centimetros'],
      ['mm', 'mm milimetro milimetros'],
      ['kg', 'kg kgs kilo kilos kilogramo kilogramos'],
      ['g', 'g gr grs gramo gramos'],
      ['lb', 'lb lbs libra libras'],
      ['t', 't ton tonelada toneladas'],
      ['L', 'l lt lts litro litros'],
      ['mL', 'ml mililitro mililitros'],
      ['galón', 'gl gal galon galones'],
      ['par', 'par pares'],
      ['docena', 'dz doc docena docenas'],
      ['juego', 'jgo juego juegos'],
      ['caja', 'cj cja caja cajas'],
      ['paquete', 'paq pqt paquete paquetes'],
      ['bulto', 'blt bulto bultos'],
      ['rollo', 'rll rollo rollos'],
    ] as const
  ).flatMap(([unit, aliases]) => aliases.split(' ').map((alias) => [alias, unit])),
)

// Lleva una unidad escrita de cualquier forma a la de la app: "MTR2" → "m²", "KGS" → "kg".
// Las que no conoce quedan como están, en minúscula si venían en mayúscula ("KIT" → "kit").
export function normalizeUnit(text: string) {
  const key = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[^a-z0-9]/g, '')
  return UNIT_ALIASES[key] ?? (text === text.toUpperCase() ? text.toLowerCase() : text)
}
