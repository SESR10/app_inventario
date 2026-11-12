import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { AppRole } from '../lib/types'
import { fakeClient } from '../test/fakeClient'
import type { CustomerOrder } from './api'

const order: CustomerOrder = {
  id: 'o1',
  customer_name: 'Juan',
  customer_phone: '300 123 4567',
  pickup_at: '2026-11-12T21:00:00Z',
  note: null,
  status: 'pending',
  source: 'assistant',
  created_at: '2026-11-12T18:00:00Z',
  items: [{ product_id: 'p1', product_name: 'Cemento gris 50 kg', unit: 'unidad', quantity: 2, price: 32000 }],
}

function setup(role: AppRole = 'admin', reply: (body: unknown) => unknown = () => ({ reply: 'Sí, hay 10.', orderIds: [] })) {
  window.history.pushState(null, '', '/asistente')
  const orders = [order]
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    rpc: {
      list_customer_orders: (args) => orders.filter((o) => !args.p_status || o.status === args.p_status),
      set_customer_order_status: (args) => {
        if (args.p_status === 'delivered') throw { hint: 'insufficient_stock' }
        orders[0] = { ...orders[0], status: args.p_status as CustomerOrder['status'] }
      },
    },
    functions: { asistente: reply },
  })
  return { client, ...render(<App client={client} />) }
}

describe('Asistente y pedidos', () => {
  it('conversa con el asistente y envía el historial', async () => {
    const user = userEvent.setup()
    const { client, container } = setup()
    expect(await screen.findByRole('heading', { name: 'Asistente y pedidos', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Juan' })).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    await user.type(screen.getByLabelText('Escribe tu mensaje'), '¿Tienen cemento?{Enter}')
    const log = await screen.findByRole('log', { name: 'Conversación' })
    expect(await within(log).findByText('Sí, hay 10.')).toBeInTheDocument()
    expect(within(log).getByText('¿Tienen cemento?')).toBeInTheDocument()
    expect(client.functions.invoke).toHaveBeenCalledWith('asistente', {
      body: { companyId: 'c1', messages: [{ role: 'user', content: '¿Tienen cemento?' }] },
    })
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue('')
    expect((await axe(container)).violations).toEqual([])
  })

  it('explica cuando el asistente no está activado y conserva el mensaje', async () => {
    const user = userEvent.setup()
    setup('admin', () => {
      throw { context: new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 }) }
    })
    await user.click(await screen.findByRole('button', { name: '¿Tienen cemento gris? ¿A cuánto?' }))
    expect(await screen.findByText(/El asistente aún no está activado/)).toBeInTheDocument()
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue('¿Tienen cemento gris? ¿A cuánto?')
  })

  it('marca pedidos y avisa si no hay stock para entregar', async () => {
    const user = userEvent.setup()
    const { client } = setup()
    await screen.findByRole('heading', { name: 'Juan' })
    expect(screen.getByText(/Total aproximado: \$64\.000,00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entregar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Entregar el pedido de Juan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, entregar' }))
    expect(await screen.findByText(/No hay stock suficiente/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Marcar listo' }))
    expect(await screen.findByText('El pedido de Juan está listo para recoger.')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('set_customer_order_status', { p_order: 'o1', p_status: 'ready' })
  })

  it('solo lectura ve los pedidos sin acciones', async () => {
    setup('viewer')
    await screen.findByRole('heading', { name: 'Juan' })
    expect(screen.queryByRole('button', { name: 'Entregar' })).not.toBeInTheDocument()
  })
})
