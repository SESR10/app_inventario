import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import { fakeClient } from '../test/fakeClient'
import { COOKIE_NOTICE_KEY, LEGAL_VERSION } from './config'

const member = { role: 'admin' as const, company: { id: 'c1', name: 'Ferretería Sol' } }

beforeEach(() => localStorage.clear())

describe('Ley 1581 y cookies', () => {
  it('no crea la cuenta sin la autorización y la guarda con la versión aceptada', async () => {
    const client = fakeClient()
    const user = userEvent.setup()
    const { container } = render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: '¿No tienes cuenta? Crea una' }))
    await user.type(screen.getByLabelText(/Correo electrónico/), 'ana@empresa.com')
    await user.type(screen.getByLabelText(/Contraseña/), 'solotexto')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(screen.getByLabelText(/Contraseña/)).toHaveAccessibleDescription(/letras y números/)
    const consent = screen.getByRole('checkbox', { name: /Acepto los Términos y condiciones/ })
    expect(consent).toHaveAttribute('aria-invalid', 'true')
    expect(client.auth.signUp).not.toHaveBeenCalled()
    expect((await axe(container)).violations).toEqual([])

    await user.clear(screen.getByLabelText(/Contraseña/))
    await user.type(screen.getByLabelText(/Contraseña/), 'secreta123')
    await user.click(consent)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@empresa.com',
      password: 'secreta123',
      options: { emailRedirectTo: window.location.origin, data: { legal_version: LEGAL_VERSION } },
    })
  })

  it('muestra los documentos legales sin iniciar sesión', async () => {
    window.history.replaceState(null, '', '/privacidad')
    const { container } = render(<App client={fakeClient()} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Política de tratamiento de datos personales' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '5. Tus derechos' })).toBeInTheDocument()
    expect(screen.getAllByText(/\(pendiente\)/).length).toBeGreaterThan(0)
    expect((await axe(container)).violations).toEqual([])
  })

  it('el aviso de cookies se cierra y no vuelve a aparecer', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App client={fakeClient()} />)
    const notice = await screen.findByRole('region', { name: 'Aviso de cookies' })
    expect(notice).toHaveTextContent('No usamos cookies de publicidad')
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument()
    expect(localStorage.getItem(COOKIE_NOTICE_KEY)).toBe(LEGAL_VERSION)
    unmount()
    render(<App client={fakeClient()} />)
    await screen.findByRole('button', { name: 'Ingresar' })
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument()
  })

  it('pide aceptar los términos a cuentas que no los han aceptado', async () => {
    const client = fakeClient({ signedIn: true, memberships: [member], rpc: { legal_pending: () => true } })
    const user = userEvent.setup()
    const { container } = render(<App client={client} />)
    expect(await screen.findByRole('heading', { name: 'Actualizamos nuestros términos' })).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Aceptar y continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('debes marcar la casilla')
    expect(client.rpc).not.toHaveBeenCalledWith('accept_legal', expect.anything())
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Aceptar y continuar' }))
    expect(client.rpc).toHaveBeenCalledWith('accept_legal', { p_version: LEGAL_VERSION })
    expect(await screen.findByRole('heading', { name: 'Resumen de tu inventario' })).toBeInTheDocument()
  })
})

describe('Acceso seguro', () => {
  it('recupera la contraseña sin revelar si el correo tiene cuenta', async () => {
    const client = fakeClient()
    const user = userEvent.setup()
    render(<App client={client} />)
    await user.click(await screen.findByRole('button', { name: '¿Olvidaste tu contraseña?' }))
    expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/Correo electrónico/), 'ana@empresa.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@empresa.com', { redirectTo: window.location.origin })
    expect(await screen.findByRole('status')).toHaveTextContent('Si ese correo tiene una cuenta')
  })

  it('pausa el ingreso después de varios intentos fallidos', async () => {
    const client = fakeClient()
    const user = userEvent.setup()
    render(<App client={client} />)
    await user.type(await screen.findByLabelText(/Correo electrónico/), 'ana@empresa.com')
    await user.type(screen.getByLabelText(/Contraseña/), 'secreta123')
    const submit = screen.getByRole('button', { name: 'Ingresar' })
    for (let i = 0; i < 5; i++) await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('espera un minuto')
    expect(submit).toBeDisabled()
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(5)
  })

  it('pide una contraseña nueva al abrir el enlace de recuperación', async () => {
    const client = fakeClient({ signedIn: true, memberships: [member] })
    client.auth.onAuthStateChange.mockImplementation(((callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'ana@empresa.com' } }))
      return { data: { subscription: { unsubscribe: () => {} } } }
    }) as never)
    const user = userEvent.setup()
    const { container } = render(<App client={client} />)
    expect(await screen.findByRole('heading', { name: 'Crea una contraseña nueva' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Contraseña nueva/), 'nueva1234')
    await user.type(screen.getByLabelText(/Repite/), 'nueva12345')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(screen.getByLabelText(/Repite/)).toHaveAccessibleDescription('Las dos contraseñas no coinciden.')
    expect((await axe(container)).violations).toEqual([])
    await user.clear(screen.getByLabelText(/Repite/))
    await user.type(screen.getByLabelText(/Repite/), 'nueva1234')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'nueva1234' })
    await user.click(await screen.findByRole('button', { name: 'Ir a mi inventario' }))
    expect(await screen.findByRole('heading', { name: 'Resumen de tu inventario' })).toBeInTheDocument()
  })
})
