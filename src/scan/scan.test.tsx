import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { AppRole } from '../lib/types'
import { fakeClient } from '../test/fakeClient'

const product = {
  id: 'p1', company_id: 'c1', sku: 'P-000001', name: 'Piso cerámico 30x60', unit: 'm²', cost: 30000, price: 42000,
  stock: 16.2, min_stock: 20, category_id: 'cat1', location_id: 'loc1', supplier_id: null, image_path: null, is_kit: false,
  extra: { Marca: 'Corona' },
}

function setup(role: AppRole = 'editor') {
  window.history.pushState(null, '', '/escanear')
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    tables: {
      products: [product],
      product_packages: [{ id: 'k1', product_id: 'p1', name: 'Caja', factor: 1.62, barcode: 'P-000001-1' }],
      categories: [{ id: 'cat1', name: 'Pisos' }],
      locations: [{ id: 'loc1', name: 'Pasillo 3' }],
    },
    rpc: {
      find_code: (args) =>
        args.p_code === 'P-000001-1' ? [{ product_id: 'p1', package_id: 'k1' }] : args.p_code === 'P-000001' ? [{ product_id: 'p1', package_id: null }] : [],
    },
  })
  return render(<App client={client} />)
}

async function typeCode(code: string) {
  await userEvent.type(await screen.findByLabelText('Escribir el código'), `${code}{Enter}`)
}

describe('Escanear', () => {
  it('muestra el producto de un código, con stock, ubicación y acciones', async () => {
    const { container } = setup()
    await typeCode('P-000001-1')
    const card = await screen.findByRole('article', { name: 'Piso cerámico 30x60' })
    expect(screen.getByRole('heading', { name: 'Piso cerámico 30x60' })).toHaveFocus()
    expect(within(card).getByText('Escaneaste la presentación Caja')).toBeInTheDocument()
    expect(within(card).getByText('Stock bajo')).toBeInTheDocument()
    expect(within(card).getByText('= 10 Caja')).toBeInTheDocument()
    expect(within(card).getByText('Pasillo 3')).toBeInTheDocument()
    expect(within(card).getByText('Corona')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Registrar salida' })).toHaveAttribute(
      'href',
      '/movimientos/nuevo?producto=p1&tipo=out&presentacion=k1',
    )
    expect(screen.getByRole('button', { name: /Piso cerámico/ })).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])
  })

  it('código desconocido: ofrece crear el producto con ese código', async () => {
    setup()
    await typeCode('7701234567890')
    expect(await screen.findByText('No hay ningún producto con el código 7701234567890.', { selector: 'p.font-semibold' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear producto con este código' })).toHaveAttribute('href', '/productos/nuevo?sku=7701234567890')
  })

  it('solo lectura: sin costo ni movimientos', async () => {
    setup('viewer')
    await typeCode('P-000001')
    const card = await screen.findByRole('article', { name: 'Piso cerámico 30x60' })
    expect(within(card).queryByText('Costo')).not.toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: 'Registrar entrada' })).not.toBeInTheDocument()
  })

  it('sin cámara disponible explica qué hacer', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Activar cámara' }))
    expect(await screen.findByText(/La cámara solo funciona si la página se abre con https/)).toBeInTheDocument()
  })
})
