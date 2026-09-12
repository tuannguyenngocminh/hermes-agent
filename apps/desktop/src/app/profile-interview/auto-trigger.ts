export const PROFILE_SOURCE_AUTO_TRIGGER_KEY = 'super-agent.profile-source-auto-trigger.v1'

export function claimProfileSourceAutoTrigger(): boolean {
  try {
    if (window.localStorage.getItem(PROFILE_SOURCE_AUTO_TRIGGER_KEY) !== null) {
      return false
    }

    window.localStorage.setItem(PROFILE_SOURCE_AUTO_TRIGGER_KEY, '1')
    return true
  } catch {
    return false
  }
}
