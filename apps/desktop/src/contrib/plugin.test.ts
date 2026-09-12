import { describe, expect, it, vi } from 'vitest'

const { bindPaneVisibility } = vi.hoisted(() => ({ bindPaneVisibility: vi.fn(() => vi.fn()) }))

vi.mock('@/components/pane-shell/tree/store', () => ({ bindPaneVisibility }))

import { createPluginContext } from './plugin'

describe('createPluginContext.onDispose', () => {
  it('collects arbitrary cleanups so the host runs them on deactivate', () => {
    const disposers: Array<() => void> = []
    const ctx = createPluginContext('demo', dispose => disposers.push(dispose))

    let cleaned = false
    ctx.onDispose(() => {
      cleaned = true
    })

    // The cleanup is tracked alongside contribution/socket disposers, so the
    // loader's deactivate (which runs every collected disposer) tears it down.
    expect(disposers).toHaveLength(1)
    disposers.forEach(dispose => dispose())
    expect(cleaned).toBe(true)
  })

  it('binds a plugin pane with a namespaced id and disposes the binding', () => {
    const disposers: Array<() => void> = []
    const ctx = createPluginContext('demo', dispose => disposers.push(dispose))
    const store = { get: () => true, listen: vi.fn(() => vi.fn()) }
    const close = vi.fn()
    const open = vi.fn()

    ctx.bindVisibility('assistant', store, close, open)

    expect(bindPaneVisibility).toHaveBeenCalledWith('demo:assistant', store, close, open)
    expect(disposers).toHaveLength(1)
    disposers[0]()
    expect(bindPaneVisibility.mock.results[0]?.value).toHaveBeenCalledOnce()
  })
})
