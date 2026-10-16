import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('asocia etiqueta, ayuda y error al campo', () => {
    render(<TextField label="Nombre" hint="Como aparece en la factura." error="Escribe el nombre." />)
    const input = screen.getByLabelText('Nombre')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Como aparece en la factura. Escribe el nombre.')
  })

  it('no marca error cuando no lo hay', () => {
    render(<TextField label="Nombre" />)
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid')
  })
})
