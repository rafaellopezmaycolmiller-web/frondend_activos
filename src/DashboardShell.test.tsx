import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { areas, roles, users } from './api'
import { DashboardShell } from './App'
import type { Area, Role, User } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()

  return {
    ...actual,
    areas: vi.fn(),
    roles: vi.fn(),
    users: vi.fn(),
  }
})

const area: Area = {
  id: 10,
  parent_id: null,
  code: 'TI',
  name: 'Tecnología de Información',
  description: null,
  is_active: true,
}

const assistantRole: Role = {
  id: 20,
  code: 'asistente_ti',
  name: 'Asistente de TI',
  description: null,
  is_system: true,
  scope: 'own_area',
  permissions: ['users.view', 'areas.view'],
}

const assistant: User = {
  id: 98765,
  name: 'Ana Lucía Rivera',
  document_number: null,
  job_title: 'Asistente de soporte tecnológico',
  phone: null,
  email: 'ana.rivera@moralesmuni.gob.pe',
  is_active: true,
  mfa_required: false,
  last_login_at: null,
  area,
  roles: [assistantRole],
  permissions: ['users.view', 'areas.view'],
}

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(users).mockResolvedValue([assistant])
    vi.mocked(areas).mockResolvedValue([area])
    vi.mocked(roles).mockRejectedValue(new Error('La API de roles no debe consultarse'))
  })

  it('muestra los usuarios del área sin solicitar perfiles no autorizados', async () => {
    render(<DashboardShell initialAssetCode={null} onLogout={vi.fn()} user={assistant} />)

    await waitFor(() => expect(areas).toHaveBeenCalledOnce())

    expect(screen.getByText('Usuarios registrados')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(users).toHaveBeenCalledOnce()
    expect(areas).toHaveBeenCalledOnce()
    expect(roles).not.toHaveBeenCalled()
  })
})
