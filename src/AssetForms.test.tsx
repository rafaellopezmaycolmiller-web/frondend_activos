import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetEditor } from './AssetForms'

describe('AssetEditor', () => {
  it('organiza el registro con los datos esenciales y la fotografía', () => {
    render(
      <AssetEditor
        areas={[]}
        canUpload
        categories={[]}
        locations={[]}
        onClose={vi.fn()}
    onSaved={vi.fn()}
    record={null}
    registeredAreaName="Patrimonio"
    statuses={[]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Registrar activo' })).toBeInTheDocument()
    expect(screen.getByText('Identificación del activo')).toBeInTheDocument()
    expect(screen.getByLabelText('Código patrimonial')).toBeInTheDocument()
    expect(screen.getByText('Fotografía del activo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar activo' })).toBeInTheDocument()
  })
})
