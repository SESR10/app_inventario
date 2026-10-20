import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { ProductRow } from '../lib/types'
import { fakeClient } from '../test/fakeClient'
import { packageEquivalence, stockBreakdown } from './units'

const base = { company_id: 'c1', cost: 0, price: 0, min_stock: 0, category_id: null, location_id: null, supplier_id: null, image_path: null }
const enchape = { ...base, id: 'e1', sku: 'ENC-01', name: 'Enchape', unit: 'm²', stock: 14.4, is_kit: false }
const kit = { ...base, id: 'kit1', sku: 'BAN-01', name: 'Baño completo', unit: 'unidad', stock: 2, is_kit: true }
const sanitario = { ...base, id: 's1', sku: 'SAN-01', name: 'Sanitario', unit: 'unidad', stock: 3, is_kit: false }
const tornillo = { ...base, id: 't1', sku: 'TOR-01', name: 'Tornillo', unit: 'unidad', stock: 9, is_kit: false }

const caja = { id: 'k1', product_id: 'e1', name: 'Caja', factor: 1.44, barcode: 'ENC-01-1' }
const pieza = { id: 'k2', product_id: 'e1', name: 'Pieza', factor: 0.18, barcode: 'ENC-01-2' }

const toRow = (p: typeof enchape): ProductRow => ({
  id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: p.price, stock: p.stock, min_stock: p.min_stock,
  is_kit: p.is_kit, category_name: null, location_name: null,
})

function setup(path: string, rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  window.history.pushState(null, '', path)
  const all = [enchape, kit, sanitario, tornillo]
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role: 'editor', company: { id: 'c1', name: 'Ferretería Sol' } }],
    tables: {
      products: all,
      product_packages: [pieza, caja],
      kit_components: [
        { kit_id: 'kit1', component_id: 's1', quantity: 1 },
        { kit_id: 'kit1', component_id: 't1', quantity: 4 },
      ],
    },
    rpc: {
      search_products: (args) => {
        const q = String(args.p_query ?? '').toLowerCase()
        return all.filter((p) => p.name.toLowerCase().includes(q)).map(toRow)
      },
      count_products: () => all.length,
      list_movements: () => [],
      ...rpc,
    },
  })
  const view = render(<App client={client} />)
  return { client, ...view }
}

describe('Unidades y presentaciones', () => {
  it('reparte el stock en presentaciones y muestra la equivalencia', () => {
    const packages = [caja, pieza]
    expect(stockBreakdown(15, packages, 'm²')).toEqual(['10 Caja', '3 Pieza', '0,06 m²'])
    expect(stockBreakdown(28.8, packages, 'm²')).toEqual(['20 Caja'])
    expect(stockBreakdown(5, [], 'm²')).toBeNull()
    expect(packageEquivalence(caja, 'm²')).toBe('1 Caja = 1,44 m²')
  })

  it('registra una entrada en cajas y la convierte a m²', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/movimientos/nuevo?producto=e1', { record_movement: () => 28.8 })
    expect(await screen.findByText(/Stock actual: 14,4 m²/)).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText('Presentación'), 'k1')
    await user.type(screen.getByLabelText(/^Cantidad que entra \(Caja\)/), '10')
    expect(screen.getByText('Son 14,4 m². Quedará con 28,8 m².')).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByText('Listo: Enchape quedó con 28,8 m² (20 Caja).')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('record_movement', {
      p_product: 'e1', p_type: 'in', p_quantity: 10, p_reason: null, p_package: 'k1',
    })
  })

  it('al escanear el código de una presentación la deja elegida', async () => {
    const user = userEvent.setup()
    setup('/movimientos/nuevo', { find_code: () => [{ product_id: 'e1', package_id: 'k2' }] })
    await user.type(await screen.findByLabelText('Buscar producto'), 'ENC-01-2{Enter}')
    expect(await screen.findByText(/Stock actual: 14,4 m²/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Presentación')).toHaveValue('k2')
    expect(screen.getByLabelText(/^Cantidad que entra \(Pieza\)/)).toBeInTheDocument()
  })
})

describe('Kits', () => {
  it('vende un kit descontando cada pieza', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/movimientos/nuevo?producto=kit1', { record_movement: () => 1 })
    expect(await screen.findByText(/Stock actual/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Ajuste/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText(/^Salida/))
    const quantity = screen.getByLabelText(/^Cantidad que sale \(kits\)/)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(quantity).toHaveAccessibleDescription('No alcanzan las piezas: de Tornillo solo quedan 9 unidad.')
    expect(client.rpc).not.toHaveBeenCalledWith('record_movement', expect.anything())

    await user.clear(quantity)
    await user.type(quantity, '1')
    expect(screen.getByText('Se descontará de cada pieza:')).toBeInTheDocument()
    expect(screen.getByText('4 unidad · Tornillo')).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(
      await screen.findByText('Listo. Con las piezas que quedan se puede armar 1 Baño completo.'),
    ).toBeInTheDocument()
  })

  it('crea un kit con sus piezas', async () => {
    const user = userEvent.setup()
    const { client, container } = setup('/productos/nuevo')
    await user.click(await screen.findByLabelText(/^Kit armado con piezas/))
    expect(screen.queryByLabelText('Stock inicial')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Nombre/), 'Baño completo')
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))
    expect(await screen.findByText('Agrega al menos una pieza al kit.')).toBeInTheDocument()
    expect(client.writes).toHaveLength(0)

    await user.type(screen.getByLabelText('Agregar pieza'), 'Tornillo{Enter}')
    const qty = await screen.findByLabelText('Cantidad por kit (unidad) de Tornillo')
    await user.clear(qty)
    await user.type(qty, '4')
    expect(screen.getByText('Con las piezas que tienes puedes armar 2 kits.')).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))
    expect(await screen.findByText(/Producto "Baño completo" guardado/)).toBeInTheDocument()
    expect(client.writes[0]).toMatchObject({ table: 'products', op: 'insert', payload: { is_kit: true, stock: 0 } })
    expect(client.rpc).toHaveBeenCalledWith('set_kit_components', {
      p_kit: 'nuevo', p_components: [{ component_id: 't1', quantity: 4 }],
    })
  })
})

describe('Producto con presentaciones', () => {
  it('valida y guarda la presentación de un producto nuevo', async () => {
    const user = userEvent.setup()
    const { client } = setup('/productos/nuevo')
    await user.type(await screen.findByLabelText(/^Nombre/), 'Enchape gris')
    await user.selectOptions(screen.getByLabelText(/^Unidad de medida/), 'm²')
    await user.click(screen.getByRole('button', { name: 'Agregar presentación' }))
    const name = screen.getAllByLabelText(/^Nombre/)[1]
    await user.type(name, 'Caja')
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))
    const factor = screen.getByLabelText(/^Cuántos m² trae/)
    expect(factor).toHaveAccessibleDescription(expect.stringContaining('Escribe cuánto trae'))
    expect(factor).toHaveFocus()

    await user.type(factor, '1,44')
    expect(factor).toHaveAccessibleDescription(expect.stringContaining('1 Caja = 1,44 m²'))
    await user.click(screen.getByRole('button', { name: 'Guardar producto' }))
    expect(await screen.findByText(/Producto "Enchape gris" guardado/)).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('set_product_packages', {
      p_product: 'nuevo', p_packages: [{ name: 'Caja', factor: 1.44, barcode: null }],
    })
  })
})
