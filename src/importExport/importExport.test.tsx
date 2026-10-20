import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import * as XLSX from 'xlsx'
import App from '../App'
import type { AppRole } from '../lib/types'
import { fakeClient } from '../test/fakeClient'

function xlsxFile(rows: unknown[][], name = 'productos.xlsx') {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Hoja1')
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([data], name)
}

function setup(role: AppRole = 'admin') {
  window.history.pushState(null, '', '/importar')
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    rpc: {
      existing_skus: () => ['T-1'],
      import_products: (args) => {
        const rows = args.p_rows as { sku: string | null }[]
        const updated = rows.filter((r) => r.sku === 'T-1').length
        return { created: rows.length - updated, updated, skipped: 0 }
      },
      export_products: (args) =>
        args.p_after_id
          ? []
          : [{ id: 'p1', sku: 'P-000001', name: 'Martillo', category: 'Herramientas', unit: 'unidad', cost: 1, price: 2, stock: 3, min_stock: 1, location: null, supplier: null }],
    },
  })
  const view = render(<App client={client} />)
  return { client, ...view }
}

let downloads: string[] = []
beforeEach(() => {
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
})

describe('Importar y exportar', () => {
  it('importa un Excel: mapea columnas, muestra errores y envía las filas correctas', async () => {
    const user = userEvent.setup()
    const { client, container } = setup()
    await screen.findByRole('heading', { name: 'Subir productos desde Excel o CSV' })

    const file = xlsxFile([
      ['Código', 'Descripción', 'Precio', 'Existencias'],
      ['', 'Martillo', 25000, 5],
      ['T-1', '', 300, ''],
      ['T-1', 'Tornillo', 'gratis', 1],
      ['', '', 10, 2],
    ])
    await user.upload(screen.getByLabelText(/Archivo de Excel o CSV/), file)

    expect(await screen.findByRole('heading', { name: /Paso 2 de 3/ })).toHaveFocus()
    expect(screen.getByText('productos.xlsx: 4 filas con datos.')).toBeInTheDocument()
    expect(screen.getByLabelText('SKU')).toHaveDisplayValue('Código (columna A), ej.: T-1')
    expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Descripción (columna B), ej.: Martillo')
    expect(screen.getByLabelText('Stock')).toHaveDisplayValue('Existencias (columna D), ej.: 5')
    expect(screen.getByLabelText('Costo')).toHaveDisplayValue('No importar')
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Revisar datos' }))
    expect(await screen.findByRole('heading', { name: /Paso 3 de 3/ })).toHaveFocus()
    expect(client.rpc).toHaveBeenCalledWith('existing_skus', { p_company: 'c1', p_skus: ['T-1'] })
    expect(screen.getByText('1 producto nuevo')).toBeInTheDocument()
    expect(screen.getByText('1 producto se actualizará')).toBeInTheDocument()
    expect(screen.getByText('2 filas tienen errores y no se importarán')).toBeInTheDocument()
    const errors = within(screen.getByRole('region', { name: /Errores/ })).getAllByRole('row')
    expect(errors.map((r) => r.textContent)).toEqual([
      'FilaColumnaProblemaCorregir',
      '4Precio"gratis" no es un número. Usa por ejemplo 1500 o 12,5.',
      '4SKUEl SKU "T-1" está repetido en el archivo; solo se importa la primera fila.',
      '5NombreFalta el nombre del producto.',
    ])
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Descargar lista de errores' }))
    await waitFor(() => expect(downloads).toEqual([expect.stringMatching(/^errores-importacion-.*\.xlsx$/)]))

    await user.click(screen.getByRole('button', { name: 'Importar 2 productos' }))
    expect(
      await screen.findByText('Importación terminada. Nuevos: 1. Actualizados: 1. Omitidos: 0.'),
    ).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('import_products', {
      p_company: 'c1',
      p_update_existing: true,
      p_rows: [
        expect.objectContaining({ sku: null, name: 'Martillo', price: 25000, stock: 5, cost: null }),
        expect.objectContaining({ sku: 'T-1', name: null, price: 300 }),
      ],
    })
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/productos')
  })

  it('importa el Excel como lo tiene la empresa: hoja, fila de títulos, otros datos y correcciones', async () => {
    const user = userEvent.setup()
    const { client, container } = setup()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Notas'], ['Lista enviada por el contador']]), 'Notas')
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['FERRETERÍA SOL'],
        ['Inventario a octubre'],
        [],
        ['Ref.', 'Descripción', 'Vr. unitario', 'Existencia', 'marnom'],
        ['A-1', 'Martillo', '$ 25.000', '5 und', 'Stanley'],
        ['A-2', 'Serrucho', 'veinte', 2, 'Truper'],
      ]),
      'Inventario',
    )
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await user.upload(await screen.findByLabelText(/Archivo de Excel o CSV/), new File([data], 'inventario.xlsx'))

    expect(await screen.findByLabelText('Hoja del archivo')).toHaveDisplayValue('Inventario (6 filas)')
    expect(screen.getByLabelText('Fila de los títulos')).toHaveDisplayValue(/^Fila 4: Ref\./)
    expect(screen.getByText('inventario.xlsx: 2 filas con datos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Precio')).toHaveDisplayValue(/^Vr\. unitario/)
    expect(screen.getByLabelText(/^marnom \(columna E\)/)).toBeChecked()
    await user.clear(screen.getByLabelText('Nombre para mostrar de marnom'))
    await user.type(screen.getByLabelText('Nombre para mostrar de marnom'), 'Marca')
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Revisar datos' }))
    expect(await screen.findByText('1 fila tiene errores y no se importará')).toBeInTheDocument()
    const fix = screen.getByLabelText('Corregir Precio de la fila 6')
    expect(fix).toHaveValue('veinte')
    await user.clear(fix)
    await user.type(fix, '20.000')
    expect((await axe(container)).violations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 corrección y revisar de nuevo' }))
    expect(await screen.findByText('2 productos nuevos')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Importar 2 productos' }))
    expect(await screen.findByText(/Importación terminada/)).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('import_products', expect.objectContaining({
      p_rows: [
        expect.objectContaining({ sku: 'A-1', price: 25000, stock: 5, extra: { Marca: 'Stanley' } }),
        expect.objectContaining({ sku: 'A-2', price: 20000, stock: 2, extra: { Marca: 'Truper' } }),
      ],
    }))
    expect(client.writes).toContainEqual(expect.objectContaining({
      table: 'import_formats',
      op: 'upsert',
      payload: expect.objectContaining({
        company_id: 'c1',
        signature: 'ref|descripcion|vrunitario|existencia|marnom',
        settings: expect.objectContaining({
          sheet: 'Inventario', headerRow: 3, extra: [{ column: 'marnom', as: 'Marca' }],
          mapping: expect.objectContaining({ sku: 'Ref.', price: 'Vr. unitario' }),
        }),
      }),
    }))
  })

  it('recuerda el formato: la segunda vez usa las columnas elegidas antes', async () => {
    const user = userEvent.setup()
    window.history.pushState(null, '', '/importar')
    const client = fakeClient({
      signedIn: true,
      memberships: [{ role: 'admin', company: { id: 'c1', name: 'Ferretería Sol' } }],
      tables: {
        import_formats: [{
          company_id: 'c1',
          signature: 'col1|col2|col3',
          settings: {
            sheet: 'Hoja1', headerRow: 0, mapping: { sku: 'col2', name: 'col1' }, extra: [{ column: 'col3', as: 'Color' }],
            updateExisting: false, categoryRows: false, boxFromName: true,
          },
        }],
      },
    })
    render(<App client={client} />)
    await user.upload(
      await screen.findByLabelText(/Archivo de Excel o CSV/),
      xlsxFile([['col1', 'col2', 'col3'], ['Martillo', 'A-1', 'Rojo'], ['Clavo', 'A-2', 'Gris']]),
    )
    expect(await screen.findByText(/Ya conocemos este formato/)).toBeInTheDocument()
    expect(screen.getByLabelText('SKU')).toHaveDisplayValue(/^col2/)
    expect(screen.getByLabelText('Nombre')).toHaveDisplayValue(/^col1/)
    expect(screen.getByLabelText('Nombre para mostrar de col3')).toHaveValue('Color')
    expect(screen.getByLabelText('Dejar el producto como está y no importar esa fila')).toBeChecked()
  })

  it('pide la columna del nombre y avisa si una columna se usa dos veces', async () => {
    const user = userEvent.setup()
    setup()
    const file = new File(['Ref;Precio\nA-1;10\n'], 'datos.csv', { type: 'text/csv' })
    await user.upload(await screen.findByLabelText(/Archivo de Excel o CSV/), file)
    await user.click(await screen.findByLabelText('Dejar el producto como está y no importar esa fila'))
    await user.click(screen.getByRole('button', { name: 'Revisar datos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige la columna del nombre.')

    await user.selectOptions(screen.getByLabelText('Nombre'), 'Precio (columna B), ej.: 10')
    await user.click(screen.getByRole('button', { name: 'Revisar datos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La columna "Precio" está elegida para más de un dato.')
  })

  it('exporta todos los productos y descarga la plantilla', async () => {
    const user = userEvent.setup()
    const { client } = setup()
    await user.click(await screen.findByRole('button', { name: 'Descargar productos en Excel' }))
    expect(await screen.findByText('Listo: se descargó un archivo con 1 producto.')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('export_products', expect.objectContaining({ p_company: 'c1', p_limit: 1000 }))
    await user.click(screen.getByRole('button', { name: 'Descargar plantilla' }))
    await waitFor(() => expect(downloads).toEqual([expect.stringMatching(/^productos-/), 'plantilla-productos.xlsx']))
  })

  it('solo lectura: puede exportar pero no importar', async () => {
    setup('viewer')
    expect(await screen.findByText(/Tu rol es de solo lectura/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Archivo de Excel o CSV/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar productos en Excel' })).toBeEnabled()
  })
})
