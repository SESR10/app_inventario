import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { WhatsAppButton } from './WhatsAppButton'

describe('WhatsAppButton', () => {
  it('abre el aviso de "Próximamente" y lo cierra con Escape devolviendo el foco', async () => {
    const user = userEvent.setup()
    const { container } = render(<WhatsAppButton />)
    const button = screen.getByRole('button', { name: 'Asistente de WhatsApp' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getByRole('dialog', { name: 'Asistente de WhatsApp' })).toHaveTextContent('Próximamente')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    expect((await axe(container)).violations).toEqual([])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })
})
