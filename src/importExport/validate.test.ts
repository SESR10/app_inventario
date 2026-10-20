import { describe, expect, it } from 'vitest'
import { normalizeUnit } from '../products/units'
import { detectHeaderRow, guessMapping } from './fields'
import { boxInName, columnStats, reviewRows, skusInFile } from './validate'

describe('guessMapping', () => {
  it('reconoce títulos en español o inglés, con tildes y mayúsculas', () => {
    const mapping = guessMapping(['Código', 'Descripción', 'PRECIO DE VENTA', 'Stock mínimo', 'Bodega', 'Otra'])
    expect(mapping).toMatchObject({ sku: 0, name: 1, price: 2, min_stock: 3, location: 4, cost: null, supplier: null })
  })

  it('reconoce títulos más largos que contienen el nombre del dato', () => {
    const mapping = guessMapping(['Nombre del producto', 'Precio de compra', 'Precio unitario', 'Cantidad en bodega'])
    expect(mapping).toMatchObject({ name: 0, cost: 1, price: 2, stock: 3, location: null })
  })

  it('reconoce títulos de programas contables con prefijo de tabla y omite columnas sin datos', () => {
    const headers = ['procod', 'pronom', 'pround', 'procosto', 'proinact', 'proubica', 'grpcod', 'grpnom', 'cantlabel', 'marnom']
    const filled = [true, true, true, true, true, false, true, true, false, true]
    expect(guessMapping(headers, filled)).toMatchObject({
      sku: 0, name: 1, unit: 2, cost: 3, category: 7, location: null, stock: null, price: null, supplier: null,
    })
  })

  it('no confunde totales, impuestos ni códigos de barras con el dato', () => {
    const mapping = guessMapping(['Código de barras', 'Referencia', 'Producto', 'Precio con IVA', 'Vr. Total', 'Cant.'])
    expect(mapping).toMatchObject({ sku: 1, name: 2, price: 3, stock: 5 })
  })

  it('encuentra la fila de títulos aunque arriba haya logo y fecha', () => {
    const cells = [['FERRETERÍA SOL'], ['Inventario a 20/10/2026'], [], ['Ref.', 'Descripción', 'Existencia', 'Vr. unitario']]
    expect(detectHeaderRow(cells)).toEqual({ row: 3, score: 4 })
  })

  it('reconoce la presentación y su contenido', () => {
    const mapping = guessMapping(['Nombre', 'Unidad', 'Presentación', 'Contenido por presentación'])
    expect(mapping).toMatchObject({ name: 0, unit: 1, package_name: 2, package_factor: 3 })
  })
})

describe('reviewRows', () => {
  const mapping = guessMapping(['SKU', 'Nombre', 'Precio', 'Stock'])

  it('separa nuevos, existentes y errores con el número de fila de Excel', () => {
    const rows = [
      ['', 'Martillo', 25000, '5'],
      ['T-1', '', '1.234,5', null],
      ['N-1', '', 10, 1],
      ['N-2', 'Tuerca', 'diez', -1],
      ['n-2', 'Tuerca bis', 1, 1],
      [null, null, null, null],
      ['', 'Clavo', '$ 1.500,50', ''],
    ]
    const review = reviewRows(rows, mapping, new Set(['t-1']), true)
    expect(review.toCreate.map((r) => r.name)).toEqual(['Martillo', 'Clavo'])
    expect(review.toCreate[1]).toMatchObject({ price: 1500.5, stock: null, sku: null })
    expect(review.toUpdate).toEqual([expect.objectContaining({ sku: 'T-1', price: 1234.5, name: null })])
    expect(review.issues).toEqual([
      { row: 4, index: 2, column: 1, field: 'name', problem: 'nameRequired', value: '' },
      { row: 5, index: 3, column: 2, field: 'price', problem: 'number', value: 'diez' },
      { row: 5, index: 3, column: 3, field: 'stock', problem: 'negative', value: '-1' },
      { row: 6, index: 4, column: 0, field: 'sku', problem: 'duplicateInFile', value: 'n-2' },
    ])
    expect(review.rowsWithErrors).toBe(3)
  })

  it('omite los existentes si se pide no actualizarlos', () => {
    const review = reviewRows([['T-1', 'Tornillo', 1, 1]], mapping, new Set(['t-1']), false)
    expect(review).toMatchObject({ toCreate: [], toUpdate: [], skipped: 1 })
  })

  it('marca textos demasiado largos', () => {
    const review = reviewRows([['', 'x'.repeat(201), 1, 1]], mapping, new Set(), true)
    expect(review.issues[0]).toMatchObject({ field: 'name', problem: 'tooLong' })
  })

  it('pide la presentación completa: nombre y contenido mayor que 0', () => {
    const withPackage = guessMapping(['Nombre', 'Presentación', 'Contenido por presentación'])
    const review = reviewRows(
      [['Enchape', 'Caja', '1,44'], ['Baldosa', 'Caja', ''], ['Piso', '', 2], ['Muro', 'Caja', 0]],
      withPackage,
      new Set(),
      true,
    )
    expect(review.toCreate[0]).toMatchObject({ package_name: 'Caja', package_factor: 1.44 })
    expect(review.issues).toEqual([
      { row: 3, index: 1, column: 2, field: 'package_factor', problem: 'packageIncomplete', value: '' },
      { row: 4, index: 2, column: 1, field: 'package_name', problem: 'packageIncomplete', value: '' },
      { row: 5, index: 3, column: 2, field: 'package_factor', problem: 'positive', value: '0' },
    ])
  })

  it('lista los SKU sin repetir para consultarlos', () => {
    expect(skusInFile([['A'], [' A '], [''], [7]], mapping)).toEqual(['A', '7'])
  })

  it('lee el Excel tal como viene: categorías, totales, unidades, cifras con texto y otros datos', () => {
    const map = guessMapping(['Código', 'Descripción', 'Unidad', 'Precio', 'Existencia', 'Marca', 'Última venta'])
    const rows = [
      ['PINTURAS', null, null, null, null, null, null],
      ['A-1', 'Vinilo blanco', 'GL', 'COP 58.000', '12 und', 'Pintuco', '  -   -  : :'],
      ['GRIFERÍAS', null, null, null, null, null, null],
      ['B-1', 'Llave lavamanos', 'UND', '$ 45.900', 3, 'Grival', '12-Aug-26'],
      [null, 'TOTAL INVENTARIO', null, null, 15, null, null],
    ]
    const review = reviewRows(rows, map, new Set(), true, {
      firstRow: 5,
      categoryRows: true,
      extraColumns: [{ column: 5, title: 'Marca' }, { column: 6, title: 'Última venta' }],
    })
    expect(review).toMatchObject({ categories: 2, ignored: 1, rowsWithErrors: 0 })
    expect(review.toCreate).toEqual([
      expect.objectContaining({
        sku: 'A-1', unit: 'galón', price: 58000, stock: 12, category: 'PINTURAS', extra: { Marca: 'Pintuco' },
      }),
      expect.objectContaining({
        sku: 'B-1', unit: 'unidad', price: 45900, category: 'GRIFERÍAS', extra: { Marca: 'Grival', 'Última venta': '12-Aug-26' },
      }),
    ])
  })

  it('crea Caja y Pieza con la caja escrita en el nombre de productos en m²', () => {
    expect(boxInName('PARED GARDA BLANCO 30*60 - 1.62 - 9')).toEqual({ area: 1.62, pieces: 9 })
    expect(boxInName('PISO DIAMANTE 60*60 1.8-5')).toEqual({ area: 1.8, pieces: 5 })
    expect(boxInName('LAVAMANOS ESTADIO BRISA - MODER')).toBeNull()
    expect(boxInName('PORCEL 601 60*60 -1.44 -4 - IMPTLS')).toEqual({ area: 1.44, pieces: 4 })
    expect(boxInName('PARED LUNEA BLANCO 25*40 - 1.5 - 15 UND - CORONA')).toEqual({ area: 1.5, pieces: 15 })
    expect(boxInName('PORCEL ESM BLANCO BETA NEGRA 60*60 - 4 - 1.44')).toEqual({ area: 1.44, pieces: 4 })
    expect(boxInName('PORCEL DOMUS BLANCO 60*1.2 - 1.44 - 2 - INTERM')).toEqual({ area: 1.44, pieces: 2 })
    expect(boxInName('PISO 30*30 - 1.62 - 9')).toBeNull()
    expect(boxInName('PARED IMP REC ONDULADA 30*60 - 1.62 -')).toBeNull()
    const map = guessMapping(['Nombre', 'Unidad'])
    const review = reviewRows(
      [['PARED GARDA BLANCO 30*60 - 1.62 - 9', 'MTR2'], ['ACC ALLEGRO *4PZ - 1 - 4', 'UNIDAD']],
      map,
      new Set(),
      true,
      { boxFromName: { box: 'Caja', piece: 'Pieza' } },
    )
    expect(review.toCreate[0]).toMatchObject({
      unit: 'm²',
      packages: [{ name: 'Caja', factor: 1.62 }, { name: 'Pieza', factor: 0.18 }],
    })
    expect(review.toCreate[1].packages).toBeUndefined()
  })

  it('cuenta datos útiles por columna', () => {
    const rows = [[0, '  -  : :', true], [0, 'x', false], [0, 'y', false]]
    expect(columnStats(rows, 0)).toMatchObject({ filled: 3, distinct: 1, useful: false })
    expect(columnStats(rows, 1)).toMatchObject({ filled: 2, distinct: 2, useful: true })
    expect(columnStats(rows, 2)).toMatchObject({ filled: 1, distinct: 1 })
  })
})

describe('normalizeUnit', () => {
  it.each([
    ['MTR2', 'm²'], ['m2', 'm²'], ['UND', 'unidad'], ['Kgs', 'kg'], ['GL', 'galón'], ['M3', 'm³'], ['lbs', 'lb'],
    ['KIT', 'kit'], ['Rollo 50 m', 'Rollo 50 m'],
  ])('%s → %s', (raw, unit) => expect(normalizeUnit(raw)).toBe(unit))
})
