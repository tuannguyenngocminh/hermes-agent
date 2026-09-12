import { describe, expect, it, vi } from 'vitest'

import { launchProfileSourceConversation } from './launcher'

describe('profile-source conversation launcher', () => {
  it('loads the internal workflow before opening the new chat', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ session_id: 'runtime-1', stored_session_id: 'stored-1' })
      .mockResolvedValueOnce({ message: 'internal profile-source workflow' })
      .mockResolvedValueOnce({ status: 'streaming' })
    const navigate = vi.fn()

    await launchProfileSourceConversation({ request, navigate, cwd: '' })

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      'session.create',
      'command.dispatch',
      'prompt.submit'
    ])
    expect(request).toHaveBeenNthCalledWith(1, 'session.create', {
      cols: 96,
      source: 'desktop',
      profile_source: true
    })
    expect(request).toHaveBeenNthCalledWith(2, 'command.dispatch', {
      session_id: 'runtime-1',
      name: 'profile-source-v4',
      arg: ''
    })
    expect(request).toHaveBeenNthCalledWith(3, 'prompt.submit', {
      session_id: 'runtime-1',
      text: 'internal profile-source workflow',
      display_kind: 'hidden'
    })
    expect(navigate).toHaveBeenCalledWith('/stored-1')
  })

  it('closes the newly-created session when workflow dispatch fails', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ session_id: 'runtime-1' })
      .mockResolvedValueOnce({ message: '' })
      .mockResolvedValueOnce(undefined)

    await expect(launchProfileSourceConversation({ request, navigate: vi.fn(), cwd: '' }))
      .rejects.toThrow('command.dispatch returned no profile workflow')

    expect(request).toHaveBeenLastCalledWith('session.close', { session_id: 'runtime-1' })
  })
})
