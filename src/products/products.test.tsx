import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { AppRole, ProductRow } from '../lib/types'
import { fakeClient } from '../test/fakeClient'

const rows: ProductRow[] = [
  { id: 'p1', sku: 'P-000001', name: 'Martillo', unit: 'unidad', price: 25000, stock: 2, min_stock: 5, is_kit: false, category_name: 'Herramientas', location_name: 'Bodega' },
  { id: 'p2', sku: 'P-000002', name: 'Tornillo', unit: 'caja', price: 1200.5, stock: 40, min_stock: 10, is_kit: false, category_name: null, location_name: null },
]

const product = {
  id: 'p1', company_id: 'c1', sku: 'P-000001', name: 'Martillo', unit: 'unidad', cost: 18000, price: 25000,
  stock: 2, min_stock: 5, category_id: 'cat1', location_id: null, supplier_id: null, image_path: 'c1/foto.png', is_kit: false,
}

function setup(path: string, role: AppRole = 'admin') {
  window.history.pushState(null, '', path)
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    tables: {
      products: [product],
      categories: [{ id: 'cat1', name: 'Herramientas' }],
    },
    rpc: {
      search_products: (args) => (args.p_low_stock ? rows.slice(0, 1) : rows),
      count_products: (args) => (args.p_low_stock ? 1 : 2),
    },
  })
  const view = render(<App client={client} />)
  return { client, ...view }
}

describe('Productos', () => {
  it('lista productos con total, stock bajo y lista accesible', async () => {
    const { container } = setup('/productos')
    expect(await screen.findByText('2 productos')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Lista de productos' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAttribute('aria-setsize', '2')
    expect(within(items[0]).getByText('Stock bajo')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Stock bajo')).not.toBeInTheDocument()
    expect(within(items[0]).getByRole('link', { name: 'Martillo' })).toHaveAttribute('href', '/productos/p1')
    expect((await axe(container)).violations).toEqual([])
  })

  it('filtra por stock bajo en el servidor', async () => {
    const { client } = setup('/productos')
    await screen.findByText('2 productos')
    await userEvent.click(screen.getByLabelText('Solo productos con stock bajo'))
    expect(await screen.findByText('1 producto')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenLastCalledWith('count_products', expect.objectContaining({ p_low_stock: true }))
  })

  it('selecciona productos e imprime sus etiquetas', async () => {
    setup('/productos')
    await userEvent.click(await screen.findByLabelText('Seleccionar Martillo'))
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir etiquetas' }))
    expect(await screen.findByRole('heading', { name: 'Etiquetas' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Código de barras del SKU P-000001' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir' }))
    expect(window.print).toHaveBeenCalled()
  })

  it('oculta la creación para usuarios de solo lectura', async () => {
    setup('/productos', 'viewer')
    await screen.findByText('2 productos')
    expect(screen.queryByRole('link', { name: 'Nuevo producto' })).not.toBeInTheDocument()
  })
})

describe('Formulario de producto', () => {
  it('valida y guarda un producto nuevo con SKU automático', async () => {
    const { client, container } = setup('/productos/nuevo')
    await userEvent.clear(await screen.findByLabelText(/Precio de venta/))
    await userEvent.type(screen.getByLabelText(/Precio de venta/), 'doce')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))

    const name = screen.getByLabelText(/^Nombre/)
    expect(name).toHaveAccessibleDescription('Escribe el nombre del producto.')
    expect(name).toHaveFocus()
    expect(screen.getByLabelText(/Precio de venta/)).toHaveAttribute('aria-invalid', 'true')
    expect((await axe(container)).violations).toEqual([])

    expect(screen.getByLabelText('Stock inicial')).toHaveValue('0')
    await userEvent.type(name, 'Taladro')
    await userEvent.clear(screen.getByLabelText(/Precio de venta/))
    await userEvent.type(screen.getByLabelText(/Precio de venta/), '1.250,50')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))

    expect(await screen.findByText('Producto "Taladro" guardado con SKU P-000001.')).toBeInTheDocument()
    expect(client.writes[0]).toMatchObject({
      table: 'products',
      op: 'insert',
      payload: { name: 'Taladro', sku: null, price: 1250.5, company_id: 'c1' },
    })
  })

  it('pide confirmación antes de eliminar', async () => {
    const { client } = setup('/productos/p1')
    expect(await screen.findByRole('heading', { name: 'Martillo' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Categoría/)).toHaveValue('cat1')
    expect(await screen.findByRole('img', { name: 'Imagen de Martillo' })).toHaveAttribute('src', 'https://img.test/a.png')

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar producto' }))
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar "Martillo"?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(client.writes).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, eliminar' }))
    expect(await screen.findByText('Producto "Martillo" eliminado.')).toBeInTheDocument()
    expect(client.writes[0]).toMatchObject({ table: 'products', op: 'delete', filters: [['id', 'p1']] })
    expect(client.storageBucket.remove).toHaveBeenCalledWith(['c1/foto.png'])
  })

  it('al editar, el stock no se cambia en el formulario sino con movimientos', async () => {
    const { client } = setup('/productos/p1')
    expect(await screen.findByRole('heading', { name: 'Martillo' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Stock actual|Stock inicial/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar entrada, salida o ajuste' })).toHaveAttribute(
      'href',
      '/movimientos/nuevo?producto=p1',
    )
    expect(screen.getByRole('link', { name: 'Ver historial' })).toHaveAttribute('href', '/movimientos?producto=p1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))
    await screen.findByText(/guardado con SKU/)
    expect(client.writes[0]).toMatchObject({ table: 'products', op: 'update' })
    expect(client.writes[0].payload).not.toHaveProperty('stock')
  })

  it('muestra el producto sin edición para solo lectura', async () => {
    setup('/productos/p1', 'viewer')
    expect(await screen.findByLabelText(/^Nombre/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar producto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar producto' })).not.toBeInTheDocument()
  })

  it('crea una categoría sin salir del formulario', async () => {
    const { client } = setup('/productos/nuevo')
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar: Nueva categoría' }))
    await userEvent.type(screen.getByLabelText(/^Nombre$/, { selector: 'input:not([name])' }), 'Pinturas{Enter}')
    await waitFor(() => expect(screen.getByLabelText(/Categoría/)).toHaveValue('nuevo'))
    expect(client.writes[0]).toMatchObject({ table: 'categories', op: 'insert', payload: { name: 'Pinturas' } })
  })
})
