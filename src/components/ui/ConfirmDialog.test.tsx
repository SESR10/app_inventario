import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('impide cerrar o confirmar otra vez durante una operacion y permite cancelar al terminar', async () => {
    const user = userEvent.setup()
    const props = {
      open: true, title: 'Eliminar producto', body: 'Esta accion elimina el producto.',
      confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', onConfirm: vi.fn(), onCancel: vi.fn(),
    }
    const { rerender } = render(<ConfirmDialog {...props} busy />)
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(props.onConfirm).not.toHaveBeenCalled()
    expect(props.onCancel).not.toHaveBeenCalled()

    rerender(<ConfirmDialog {...props} busy={false} />)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(props.onCancel).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onCancel).toHaveBeenCalledTimes(2)
  })
})
