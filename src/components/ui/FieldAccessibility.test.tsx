import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SelectField } from './SelectField'
import { TextField } from './TextField'

describe.each(['input', 'select'] as const)('Accesibilidad de %s', (kind) => {
  it('conserva la ayuda externa junto con la ayuda y el error del campo', () => {
    const props = {
      label: 'Producto', hint: 'Ayuda del campo.', error: 'Revisa el valor.',
      'aria-describedby': 'ayuda-externa', 'aria-invalid': false as const,
    }
    render(<>
      <p id="ayuda-externa">Ayuda compartida.</p>
      {kind === 'input' ? <TextField {...props} /> : <SelectField {...props}><option>Uno</option></SelectField>}
    </>)
    const field = screen.getByLabelText('Producto')
    expect(field).toHaveAccessibleDescription('Ayuda compartida. Ayuda del campo. Revisa el valor.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('respeta la validacion externa si no hay error interno', () => {
    const props = { label: 'Producto', 'aria-invalid': true as const }
    render(kind === 'input' ? <TextField {...props} /> : <SelectField {...props}><option>Uno</option></SelectField>)
    expect(screen.getByLabelText('Producto')).toHaveAttribute('aria-invalid', 'true')
  })
})
