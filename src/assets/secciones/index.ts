// Fotos de cada sección (generadas en Figma, archivo "App Inventario - Rediseño"). Reemplazan los íconos de línea.
import asistente from './asistente.webp'
import bodega from './bodega.webp'
import caja from './caja.webp'
import equipo from './equipo.webp'
import importar from './importar.webp'
import movimientos from './movimientos.webp'
import panel from './panel.webp'

export const sectionImages = { panel, caja, movimientos, asistente, importar, equipo, bodega }
export type SectionImage = keyof typeof sectionImages
