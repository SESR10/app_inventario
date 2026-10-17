import { describe, expect, it } from 'vitest'
import { guessMapping } from './fields'
import { reviewRows, skusInFile } from './validate'

describe('guessMapping', () => {
  it('reconoce títulos en español o inglés, con tildes y mayúsculas', () => {
    const mapping = guessMapping(['Código', 'Descripción', 'PRECIO DE VENTA', 'Stock mínimo', 'Bodega', 'Otra'])
    expect(mapping).toMatchObject({ sku: 0, name: 1, price: 2, min_stock: 3, location: 4, cost: null, supplier: null })
  })

  it('reconoce títulos más largos que contienen el nombre del dato', () => {
    const mapping = guessMapping(['Nombre del producto', 'Precio de compra', 'Precio unitario', 'Cantidad en bodega'])
    expect(mapping).toMatchObject({ name: 0, cost: 1, price: 2, stock: 3, location: null })
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
      { row: 4, field: 'name', problem: 'nameRequired', value: '' },
      { row: 5, field: 'price', problem: 'number', value: 'diez' },
      { row: 5, field: 'stock', problem: 'negative', value: '-1' },
      { row: 6, field: 'sku', problem: 'duplicateInFile', value: 'n-2' },
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

  it('lista los SKU sin repetir para consultarlos', () => {
    expect(skusInFile([['A'], [' A '], [''], [7]], mapping)).toEqual(['A', '7'])
  })
})
