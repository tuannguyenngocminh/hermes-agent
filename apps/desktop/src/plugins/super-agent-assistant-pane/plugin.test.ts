import { beforeEach, describe, expect, it, vi } from 'vitest'

import plugin from './plugin'

const { activeGatewayProfile, ensureDailyReviewJob, gatewayState, isSecondaryWindow } = vi.hoisted(() => ({
  activeGatewayProfile: { get: vi.fn(() => 'bp86-fresh'), listen: vi.fn(() => vi.fn()) },
  ensureDailyReviewJob: vi.fn(),
  gatewayState: { get: vi.fn(() => 'open'), listen: vi.fn(() => vi.fn()) },
  isSecondaryWindow: vi.fn(() => false)
}))

vi.mock('@hermes/plugin-sdk', () => ({ PANES_AREA: 'panes' }))
vi.mock('@/store/profile', () => ({ $activeGatewayProfile: activeGatewayProfile }))
vi.mock('@/store/session', () => ({ $gatewayState: gatewayState }))
vi.mock('@/store/windows', () => ({ isSecondaryWindow }))
vi.mock('./ensure-daily-review-job', () => ({ ensureDailyReviewJob }))

describe('Super Agent assistant pane plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSecondaryWindow.mockReturnValue(false)
    gatewayState.get.mockReturnValue('open')
    activeGatewayProfile.get.mockReturnValue('bp86-fresh')
  })

  it('registers floating and docked panes with shared visibility bindings', () => {
    const registerMany = vi.fn()
    const bindVisibility = vi.fn()

    plugin.register({ registerMany, bindVisibility, onDispose: vi.fn() } as never)

    expect(plugin.defaultEnabled).toBe(true)
    expect(registerMany).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'assistant-pane-floating',
        area: 'panes',
        title: 'Siêu trợ lý',
        data: {
          placement: 'floating',
          anchor: 'bottom-right',
          customHeader: true,
          width: '380px',
          height: '520px'
        }
      }),
      expect.objectContaining({
        id: 'assistant-pane-docked',
        data: expect.objectContaining({ placement: 'right', customHeader: true })
      })
    ])
    expect(bindVisibility).toHaveBeenCalledTimes(2)
  })

  it('subscribes to gateway/profile and registers both disposers', () => {
    const onDispose = vi.fn()

    plugin.register({ registerMany: vi.fn(), bindVisibility: vi.fn(), onDispose } as never)

    expect(gatewayState.listen).toHaveBeenCalledOnce()
    expect(activeGatewayProfile.listen).toHaveBeenCalledOnce()
    expect(ensureDailyReviewJob).toHaveBeenCalledWith('bp86-fresh')
    expect(onDispose).toHaveBeenCalledTimes(2)
    expect(onDispose.mock.calls.every(([dispose]) => typeof dispose === 'function')).toBe(true)

    ensureDailyReviewJob.mockClear()
    const gatewayListener = (gatewayState.listen.mock.calls[0] as unknown as [() => void])[0]
    const profileListener = (activeGatewayProfile.listen.mock.calls[0] as unknown as [() => void])[0]
    gatewayListener()
    profileListener()
    expect(ensureDailyReviewJob).toHaveBeenCalledTimes(2)
  })

  it('does not call the API from a secondary session window', () => {
    isSecondaryWindow.mockReturnValue(true)

    plugin.register({ registerMany: vi.fn(), bindVisibility: vi.fn(), onDispose: vi.fn() } as never)

    expect(ensureDailyReviewJob).not.toHaveBeenCalled()
  })
})
