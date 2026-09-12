import { describe, expect, it } from 'vitest'

import plugin, { WORKSPACE_PATH, workspaceNav, workspaceRoute } from './plugin'

describe('super-agent workspace plugin', () => {
  it('registers the independent /kho route and sidebar entry', () => {
    expect(WORKSPACE_PATH).toBe('/kho')
    expect(workspaceRoute.path).toBe('/kho')
    expect(workspaceNav.label).toBe('Thư mục làm việc')
    expect(plugin.defaultEnabled).toBe(true)
  })
})
