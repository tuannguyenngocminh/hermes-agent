import { afterEach, describe, expect, it, vi } from 'vitest'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@hermes/plugin-sdk', () => ({
  PALETTE_AREA: 'palette',
  host: { navigate }
}))

import { $advancedMode, setAdvancedMode } from '@/app/advanced-mode'

import advancedPlugin from './plugin'

afterEach(() => {
  setAdvancedMode(false)
  navigate.mockReset()
})

describe('super-agent-advanced plugin', () => {
  it('is opt-in so a fresh profile starts in simple mode', () => {
    expect(advancedPlugin.defaultEnabled).toBe(false)
    expect($advancedMode.get()).toBe(false)
  })

  it('activates advanced mode and disposes its palette contribution live', () => {
    const register = vi.fn(() => vi.fn())
    const registerMany = vi.fn(() => vi.fn())
    let dispose: (() => void) | undefined

    advancedPlugin.register({
      onDispose: (cleanup: () => void) => {
        dispose = cleanup
      },
      register,
      registerMany
    } as never)

    expect($advancedMode.get()).toBe(true)
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        area: 'palette',
        data: expect.objectContaining({ id: 'advanced.openSkills', label: 'Mở Skills nâng cao' })
      })
    )
    expect(dispose).toBeTypeOf('function')

    dispose?.()

    expect($advancedMode.get()).toBe(false)
  })
})
