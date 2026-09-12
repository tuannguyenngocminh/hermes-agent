export const PROFILE_SOURCE_WORKFLOW = 'profile-source-v4'

type Request = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

type ProfileSourceConversationHost = {
  cwd: string
  navigate: (path: string) => void
  request: Request
}

export async function launchProfileSourceConversation(host: ProfileSourceConversationHost): Promise<string> {
  let sessionId: string | null = null

  try {
    const created = await host.request<{ session_id: string; stored_session_id?: string }>('session.create', {
      cols: 96,
      source: 'desktop',
      // This is a narrowly-scoped capability flag, not a user preference: the
      // gateway adds only the bundled source_profile tool for this one chat.
      profile_source: true,
      ...(host.cwd ? { cwd: host.cwd } : {})
    })
    sessionId = created.session_id
    const dispatch = await host.request<{ message?: string }>('command.dispatch', {
      session_id: sessionId,
      name: PROFILE_SOURCE_WORKFLOW,
      arg: ''
    })
    const text = dispatch.message?.trim()

    if (!text) throw new Error('command.dispatch returned no profile workflow')

    await host.request('prompt.submit', { session_id: sessionId, text, display_kind: 'hidden' })
    const routeSessionId = created.stored_session_id ?? sessionId
    host.navigate(`/${encodeURIComponent(routeSessionId)}`)

    return routeSessionId
  } catch (error) {
    if (sessionId) {
      try {
        await host.request('session.close', { session_id: sessionId })
      } catch {
        // Preserve the original launch error; cleanup is best effort.
      }
    }
    throw error
  }
}
