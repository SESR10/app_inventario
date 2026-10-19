import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from './App'
import { fakeClient } from './test/fakeClient'

describe('App', () => {
  it('explica cómo configurar Supabase si faltan las claves', () => {
    render(<App client={null} />)
    expect(screen.getByRole('heading', { name: 'Falta conectar la base de datos' })).toBeInTheDocument()
  })

  it('valida el formulario de ingreso sin llamar al servidor', async () => {
    const client = fakeClient()
    render(<App client={client} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }))
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveAccessibleDescription('Escribe tu correo electrónico.')
    expect(screen.getByLabelText(/Contraseña/)).toHaveAttribute('aria-invalid', 'true')
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('muestra un error claro con credenciales incorrectas', async () => {
    const client = fakeClient()
    const { container } = render(<App client={client} />)
    await userEvent.type(await screen.findByLabelText(/Correo electrónico/), 'ana@empresa.com')
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'secreta123')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.')
    expect((await axe(container)).violations).toEqual([])
  })

  it('pide crear una empresa a quien no pertenece a ninguna', async () => {
    const client = fakeClient({ signedIn: true })
    render(<App client={client} />)
    await userEvent.type(await screen.findByLabelText(/Nombre de la empresa/), 'Ferretería Sol')
    await userEvent.click(screen.getByRole('button', { name: 'Crear empresa' }))
    expect(client.rpc).toHaveBeenCalledWith('create_company', { company_name: 'Ferretería Sol' })
  })

  it('muestra el panel con menú accesible para miembros', async () => {
    const client = fakeClient({
      signedIn: true,
      memberships: [{ role: 'admin', company: { id: 'c1', name: 'Ferretería Sol' } }],
    })
    const { container } = render(<App client={client} />)
    expect(await screen.findByRole('heading', { name: 'Resumen de Ferretería Sol' })).toHaveFocus()
    expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido principal' })).toHaveAttribute('href', '#contenido')
    expect(document.title).toBe('Panel · Inventario')
    expect((await axe(container)).violations).toEqual([])
  })
})
