import { describe, expect, it } from 'vitest'

import { navigationFor } from './App'

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
})
