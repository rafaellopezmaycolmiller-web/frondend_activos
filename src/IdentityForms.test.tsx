import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserEditor } from './IdentityForms'

describe('UserEditor', () => {
  it('impide guardar una cuenta sin al menos un rol', () => {
    render(
      <UserEditor
        areas={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        record={null}
        roles={[]}
      />,
    )

    const submitButton = screen.getByRole('button', { name: 'Guardar cambios' })
    const form = submitButton.closest('form')

    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(screen.getByRole('alert')).toHaveTextContent('Seleccione al menos un rol')
  })
})
