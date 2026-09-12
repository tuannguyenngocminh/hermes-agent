import { describe, expect, it, vi } from 'vitest'

import plugin from './plugin'

vi.mock('@hermes/plugin-sdk', () => ({
  DASHBOARD_AREA: 'dashboard',
  SIDEBAR_NAV_AREA: 'sidebar.nav'
}))

describe('Super Agent Dashboard plugin', () => {
  it('is enabled by default and registers the dashboard area with registry order', () => {
    const registerMany = vi.fn()

    plugin.register({ registerMany } as never)

    expect(plugin.defaultEnabled).toBe(true)
    expect(registerMany).toHaveBeenCalledWith([
      expect.objectContaining({ area: 'dashboard', order: 0 }),
      expect.objectContaining({
        area: 'sidebar.nav',
        data: { codicon: 'home', label: 'Dashboard', path: '/' },
        order: 40
      })
    ])
  })
})
