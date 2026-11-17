import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuditContent, LoginView, navigationFor } from './App'
import type { Area, AuditEvent } from './types'

describe('LoginView', () => {
  it('presenta un acceso institucional sin credenciales precargadas', () => {
    render(
      <LoginView
        onAuthenticated={vi.fn()}
        onForgot={vi.fn()}
        onMfa={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Bienvenido' })).toBeInTheDocument()
    expect(screen.getByText('Gestión clara de los activos municipales.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo institucional')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })
})

describe('navigationFor', () => {
  it('muestra únicamente las secciones autorizadas', () => {
    const navigation = navigationFor({
      permissions: ['dashboard.view', 'audit.view'],
    })

    expect(navigation.map((item) => item.key)).toEqual(['dashboard', 'audit'])
  })

  it('no expone accesos administrativos sin permisos', () => {
    const navigation = navigationFor({
      permissions: ['dashboard.view'],
    })

    expect(navigation.map((item) => item.key)).not.toContain('users')
    expect(navigation.map((item) => item.key)).not.toContain('roles')
  })

  it('mantiene los perfiles dentro de usuarios y no como un menú técnico', () => {
    const navigation = navigationFor({
      permissions: ['dashboard.view', 'users.view', 'roles.view'],
    })

    expect(navigation.map((item) => item.key)).toEqual(['dashboard', 'users'])
  })
})

describe('AuditContent', () => {
  it('muestra una acción comprensible con activo, responsable, perfil y área', () => {
    const area: Area = {
      id: 1,
      parent_id: null,
      code: 'TI',
      name: 'Tecnologías de la Información',
      description: null,
      is_active: true,
    }
    const record: AuditEvent = {
      id: 10,
      event: 'assets.asset.updated',
      actor: {
        id: 2,
        name: 'María Quispe',
        email: 'maria@muni.test',
        job_title: 'Responsable de soporte',
        area: { id: area.id, code: area.code, name: area.name },
        roles: [{ id: 3, code: 'ti_admin', name: 'Administrador de TI' }],
      },
      area,
      subject_type: 'App\\Models\\Asset',
      subject_id: '5',
      subject: {
        id: '5',
        type: 'asset',
        label: 'Computadora de Tesorería',
        reference: 'MDM-TI-0001',
        context: 'Ficha del activo',
        asset: { id: 5, name: 'Computadora de Tesorería', asset_code: 'MDM-TI-0001' },
      },
      request_id: 'request-1',
      ip_address: '127.0.0.1',
      metadata: {
        before: { serial_number: 'ANTERIOR' },
        after: { serial_number: 'NUEVO' },
        reason: 'Se corrigió la etiqueta física.',
      },
      occurred_at: '2026-11-17T00:00:00-05:00',
    }

    render(<AuditContent records={[record]} />)

    expect(screen.getByRole('heading', { name: 'Actualizó un activo' })).toBeInTheDocument()
    expect(screen.getByText('Computadora de Tesorería')).toBeInTheDocument()
    expect(screen.getByText('María Quispe')).toBeInTheDocument()
    expect(screen.getByText('Administrador de TI')).toBeInTheDocument()
    expect(screen.getByText('Tecnologías de la Información')).toBeInTheDocument()
    expect(screen.getByText(/Datos modificados: número de serie/)).toBeInTheDocument()
    expect(screen.queryByText('assets.asset.updated')).not.toBeInTheDocument()
  })
})
