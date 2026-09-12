import { describe, expect, it } from 'vitest'

import {
  appViewForPath,
  COMPOSER_ROUTE,
  DASHBOARD_ROUTE,
  isSkillsNavigationVisible,
  NEW_CHAT_ROUTE,
  primaryRouteSelectedSessionId,
  sessionRoute,
  SETTINGS_ROUTE,
  SKILLS_ROUTE
} from './routes'

const SESS_A = 'sess-a'
const SESS_B = 'sess-b'

describe('primaryRouteSelectedSessionId', () => {
  it('prefers the routed session id over a stale/different store selection (#59305)', () => {
    // The route already committed to B while the store selection hasn't
    // caught up yet (still reads A) — the route wins.
    expect(primaryRouteSelectedSessionId(sessionRoute(SESS_B), SESS_A)).toBe(SESS_B)
  })

  it('returns null on the new-chat route even with a leftover selection from the previous chat', () => {
    expect(primaryRouteSelectedSessionId(NEW_CHAT_ROUTE, SESS_A)).toBeNull()
  })

  it('falls back to the store selection on a non-chat route (settings, overlays)', () => {
    expect(primaryRouteSelectedSessionId(SETTINGS_ROUTE, SESS_A)).toBe(SESS_A)
  })

  it('falls back to the store selection when the route matches the same session', () => {
    expect(primaryRouteSelectedSessionId(sessionRoute(SESS_A), SESS_A)).toBe(SESS_A)
  })

  it('returns null on a non-chat route with no store selection', () => {
    expect(primaryRouteSelectedSessionId(SETTINGS_ROUTE, null)).toBeNull()
  })
})

describe('default route view mapping', () => {
  it('resolves the root route to the work dashboard view', () => {
    expect(appViewForPath(DASHBOARD_ROUTE)).toBe('dashboard')
  })

  it('resolves the composer route to chat', () => {
    expect(appViewForPath(COMPOSER_ROUTE)).toBe('chat')
  })

  it('keeps a session route on the chat view', () => {
    expect(appViewForPath('/session-test')).toBe('chat')
  })
})

describe('skills navigation visibility by mode', () => {
  it('hides the core skills entry in simple mode while preserving the route', () => {
    expect(isSkillsNavigationVisible(false)).toBe(false)
    expect(appViewForPath(SKILLS_ROUTE)).toBe('skills')
  })

  it('shows the core skills entry in advanced mode and keeps deep links on skills', () => {
    expect(isSkillsNavigationVisible(true)).toBe(true)
    expect(appViewForPath(`${SKILLS_ROUTE}?tab=mcp`)).toBe('skills')
  })
})
