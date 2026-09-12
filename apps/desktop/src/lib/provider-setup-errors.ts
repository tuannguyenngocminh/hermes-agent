const PROVIDER_SETUP_ERROR_RE =
  /No (?:inference|Hermes) provider(?: is)? configured|no_provider_configured|set an API key/i

const SESSION_INFO_CREDENTIAL_WARNING_RE = /^No API key configured for provider '[^']*'\. First message will fail\.$/
const QUOTA_OR_RATE_LIMIT_RE = /(?:quota|rate[\s_-]*limit|too many requests|usage limit|\b429\b)/i

export function isProviderSetupErrorMessage(message: null | string | undefined): boolean {
  const text = message?.trim()

  if (!text) {
    return false
  }

  return PROVIDER_SETUP_ERROR_RE.test(text) || SESSION_INFO_CREDENTIAL_WARNING_RE.test(text)
}

export function isOpenAICodexQuotaErrorMessage(message: null | string | undefined, providerId: null | string | undefined) {
  return providerId?.trim().toLowerCase() === 'openai-codex' && QUOTA_OR_RATE_LIMIT_RE.test(message?.trim() ?? '')
}
