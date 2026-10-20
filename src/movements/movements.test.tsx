import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { AppRole, Movement, ProductRow } from '../lib/types'
import { fakeClient } from '../test/fakeClient'

const rows: ProductRow[] = [
  { id: 'p1', sku: 'P-000001', name: 'Martillo', unit: 'unidad', price: 25000, stock: 2, min_stock: 5, is_kit: false, category_name: null, location_name: null },
  { id: 'p2', sku: 'P-000002', name: 'Tornillo', unit: 'caja', price: 1200, stock: 40, min_stock: 10, is_kit: false, category_name: null, location_name: null },
]

const product = {
  id: 'p1', company_id: 'c1', sku: 'P-000001', name: 'Martillo', unit: 'unidad', cost: 18000, price: 25000,
  stock: 2, min_stock: 5, category_id: null, location_id: null, supplier_id: null, image_path: null, is_kit: false,
}

const history: Movement[] = [
  { id: 3, created_at: '2026-10-19T15:30:00Z', type: 'out', quantity: -8, stock_after: 2, reason: 'Venta factura 12', package_name: null, package_qty: null, kit_name: null, kit_qty: null, product_id: 'p1', product_name: 'Martillo', product_sku: 'P-000001', unit: 'unidad', user_email: 'ana@empresa.com' },
  { id: 2, created_at: '2026-10-18T10:00:00Z', type: 'in', quantity: 6, stock_after: 10, reason: '@import', package_name: null, package_qty: null, kit_name: null, kit_qty: null, product_id: 'p1', product_name: 'Martillo', product_sku: 'P-000001', unit: 'unidad', user_email: null },
  { id: 1, created_at: '2026-10-17T09:00:00Z', type: 'adjust', quantity: 4, stock_after: 4, reason: null, package_name: null, package_qty: null, kit_name: null, kit_qty: null, product_id: 'p2', product_name: 'Tornillo', product_sku: 'P-000002', unit: 'caja', user_email: 'beto@empresa.com' },
]

function setup(path: string, role: AppRole = 'editor', extra: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  window.history.pushState(null, '', path)
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    tables: { products: [product] },
    rpc: {
      search_products: (args) => {
        const q = String(args.p_query ?? '').toLowerCase()
        if (args.p_low_stock) return rows.filter((r) => r.stock <= r.min_stock)
        return rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
      },
      count_products: () => 2,
      list_movements: (args) => history.filter((m) => !args.p_type || m.type === args.p_type),
      record_movement: (args) => (args.p_type === 'out' ? 40 - Number(args.p_quantity) : Number(args.p_quantity)),
      dashboard_summary: () => ({ products: 2, low_stock: 1, out_of_stock: 0, stock_cost: 36000, stock_price: 98000, movements_7d: 3 }),
      ...extra,
    },
  })
  const view = render(<App client={client} />)
  return { client, ...view }
}

describe('Registrar movimientos', () => {
  it('escanea un SKU, valida la salida y la registra', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/movimientos/nuevo')
    const search = await screen.findByLabelText('Buscar producto')
    await user.type(search, 'p-000002{Enter}')
    expect(await screen.findByText(/Stock actual: 40 caja/)).toBeInTheDocument()

    await user.click(screen.getByLabelText(/^Salida/))
    await user.type(screen.getByLabelText(/Cantidad que sale/), '50')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    const quantity = screen.getByLabelText(/Cantidad que sale/)
    expect(quantity).toHaveAccessibleDescription('No hay suficiente stock: solo quedan 40 caja.')
    expect(quantity).toHaveFocus()
    expect(client.rpc).not.toHaveBeenCalledWith('record_movement', expect.anything())

    await user.clear(quantity)
    await user.type(quantity, '5')
    expect(screen.getByText('Quedará con 35 caja.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Motivo'), 'Venta mostrador')
    expect((await axe(container)).violations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))

    expect(await screen.findByText('Listo: Tornillo quedó con 35 caja.')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('record_movement', {
      p_product: 'p2', p_type: 'out', p_quantity: 5, p_reason: 'Venta mostrador', p_package: null,
    })
    // Listo para el siguiente producto.
    await waitFor(() => expect(screen.getByLabelText('Buscar producto')).toHaveFocus())
  })

  it('ajuste desde la ficha: pide motivo y avisa si queda con stock bajo', async () => {
    const user = userEvent.setup()
    const { client } = setup('/movimientos/nuevo?producto=p1')
    expect(await screen.findByText(/Stock actual: 2 unidad/)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/^Ajuste/))
    await user.type(screen.getByLabelText(/Stock contado/), '2')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(screen.getByLabelText(/Stock contado/)).toHaveAccessibleDescription(
      'El stock contado es igual al actual; no hay nada que ajustar.',
    )
    expect(screen.getByLabelText(/Motivo/)).toHaveAccessibleDescription(
      'Por ejemplo: compra a proveedor, venta factura 123, producto dañado. Escribe por qué ajustas el stock.',
    )

    await user.clear(screen.getByLabelText(/Stock contado/))
    await user.type(screen.getByLabelText(/Stock contado/), '1')
    await user.type(screen.getByLabelText(/Motivo/), 'Conteo mensual')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByText('Listo: Martillo quedó con 1 unidad.')).toBeInTheDocument()
    expect(screen.getByText('Atención: Martillo quedó con stock bajo (mínimo 5).')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('record_movement', expect.objectContaining({ p_type: 'adjust', p_quantity: 1 }))
    expect(screen.getByText(/Stock actual: 1 unidad/)).toBeInTheDocument()
  })

  it('muestra el error de la base si otro usuario dejó sin stock', async () => {
    const user = userEvent.setup()
    setup('/movimientos/nuevo?producto=p1', 'editor', {
      record_movement: () => {
        throw { hint: 'insufficient_stock' }
      },
    })
    await screen.findByText(/Stock actual: 2 unidad/)
    await user.click(screen.getByLabelText(/^Salida/))
    await user.type(screen.getByLabelText(/Cantidad que sale/), '1')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByText('No hay suficiente stock: solo quedan 2 unidad.')).toBeInTheDocument()
  })

  it('solo lectura no puede registrar', async () => {
    setup('/movimientos/nuevo', 'viewer')
    expect(await screen.findByText(/Tu rol es de solo lectura/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar producto')).not.toBeInTheDocument()
  })
})

describe('Historial de movimientos', () => {
  it('muestra quién, cuándo, cuánto y por qué, y filtra por tipo', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/movimientos')
    const list = await screen.findByRole('list', { name: 'Historial de movimientos' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Venta factura 12')
    expect(items[0]).toHaveTextContent('Por ana@empresa.com')
    expect(items[0]).toHaveTextContent('−8 unidad')
    expect(items[1]).toHaveTextContent('Importación desde Excel')
    expect(items[1]).toHaveTextContent('Usuario eliminado')
    expect(items[2]).toHaveTextContent('Sin motivo')
    expect((await axe(container)).violations).toEqual([])

    await user.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'Salida')
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Historial de movimientos' })).getAllByRole('listitem')).toHaveLength(1))
    expect(client.rpc).toHaveBeenLastCalledWith('list_movements', expect.objectContaining({ p_type: 'out', p_company: 'c1' }))
  })

  it('filtra por producto desde su ficha', async () => {
    const { client } = setup('/movimientos?producto=p1')
    expect(await screen.findByText('Mostrando solo: Martillo (P-000001)')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('list_movements', expect.objectContaining({ p_product: 'p1' }))
    expect(screen.getByRole('link', { name: 'Registrar movimiento' })).toHaveAttribute('href', '/movimientos/nuevo?producto=p1')
  })
})

describe('Panel', () => {
  it('resume el inventario, alerta el stock bajo y lleva a la lista filtrada', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/')
    expect(await screen.findByText('Tienes 1 producto con stock bajo.')).toBeInTheDocument()
    const stats = screen.getByRole('region', { name: 'Resumen del inventario' })
    expect(within(stats).getByText('Agotados').closest('div')).toHaveTextContent('0')
    expect(within(stats).getByText('Valor del inventario (costo)').closest('div')).toHaveTextContent('36.000,00')
    expect(screen.getByText('2 de mínimo 5 unidad')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Últimos movimientos' })).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('link', { name: 'Ver productos con stock bajo' }))
    expect(await screen.findByLabelText('Solo productos con stock bajo')).toBeChecked()
    expect(client.rpc).toHaveBeenLastCalledWith('count_products', expect.objectContaining({ p_low_stock: true }))
  })
})
