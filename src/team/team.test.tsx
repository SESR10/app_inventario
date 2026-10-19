import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import App from '../App'
import type { AppRole } from '../lib/types'
import { fakeClient } from '../test/fakeClient'

const people = [
  { user_id: 'u1', email: 'ana@empresa.com', role: 'admin', created_at: '2026-10-16T00:00:00Z' },
  { user_id: 'u2', email: 'beto@empresa.com', role: 'viewer', created_at: '2026-10-17T00:00:00Z' },
]

function setup(role: AppRole = 'admin') {
  window.history.pushState(null, '', '/equipo')
  const client = fakeClient({
    signedIn: true,
    memberships: [{ role, company: { id: 'c1', name: 'Ferretería Sol' } }],
    tables: { company_invitations: [{ email: 'caro@empresa.com', role: 'editor', created_at: '2026-10-18T00:00:00Z' }] },
    rpc: {
      company_people: () => people,
      invite_member: (args) => {
        if (args.p_email === 'beto@empresa.com') throw { hint: 'already_member' }
        return 'invited'
      },
    },
  })
  const view = render(<App client={client} />)
  return { client, ...view }
}

describe('Equipo', () => {
  it('invita, cambia roles y quita personas con confirmación', async () => {
    const user = userEvent.setup()
    const { client, container } = setup()
    expect(await screen.findByText('ana@empresa.com')).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('claim_invitations')
    expect(screen.getByText('(tú)')).toBeInTheDocument()
    expect(screen.getByText(/caro@empresa.com/)).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])

    const email = screen.getByLabelText(/^Correo/)
    await user.type(email, 'no-es-correo')
    await user.click(screen.getByRole('button', { name: 'Invitar' }))
    expect(email).toHaveAccessibleDescription('Escribe un correo válido, por ejemplo nombre@empresa.com.')

    await user.clear(email)
    await user.type(email, 'beto@empresa.com')
    await user.click(screen.getByRole('button', { name: 'Invitar' }))
    expect(await screen.findByText('Esa persona ya tiene acceso a la empresa.')).toBeInTheDocument()

    await user.clear(email)
    await user.type(email, 'Dani@Empresa.com')
    await user.selectOptions(screen.getByLabelText('Rol'), 'Solo lectura')
    await user.click(screen.getByRole('button', { name: 'Invitar' }))
    expect(await screen.findByText(/dani@empresa.com aún no tiene cuenta/)).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('invite_member', { p_company: 'c1', p_email: 'dani@empresa.com', p_role: 'viewer' })

    await user.selectOptions(screen.getByLabelText('Rol de beto@empresa.com'), 'Editor')
    expect(await screen.findByText('Listo: ahora beto@empresa.com es Editor.')).toBeInTheDocument()
    expect(client.writes).toContainEqual(
      expect.objectContaining({ table: 'company_members', op: 'update', payload: { role: 'editor' }, filters: [['company_id', 'c1'], ['user_id', 'u2']] }),
    )

    await user.click(screen.getByRole('button', { name: 'Quitar a beto@empresa.com' }))
    const dialog = screen.getByRole('dialog', { name: '¿Quitar a beto@empresa.com?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, quitar' }))
    expect(await screen.findByText('beto@empresa.com ya no tiene acceso.')).toBeInTheDocument()
    expect(client.writes).toContainEqual(expect.objectContaining({ table: 'company_members', op: 'delete' }))

    await user.click(screen.getByRole('button', { name: 'Cancelar invitación de caro@empresa.com' }))
    expect(await screen.findByText('Se canceló la invitación de caro@empresa.com.')).toBeInTheDocument()
  })

  it('quien no es administrador solo ve el equipo', async () => {
    setup('editor')
    expect(await screen.findByText('ana@empresa.com')).toBeInTheDocument()
    expect(screen.getByText(/Solo un administrador puede invitar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invitar' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rol de beto@empresa.com')).not.toBeInTheDocument()
    expect(screen.queryByText(/caro@empresa.com/)).not.toBeInTheDocument()
  })
})
