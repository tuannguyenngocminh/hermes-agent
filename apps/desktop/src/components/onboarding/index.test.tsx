import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $desktopOnboarding, type DesktopOnboardingState, type OnboardingContext } from '@/store/onboarding'
import type { OAuthProvider } from '@/types/hermes'

import { Picker } from '.'

function provider(id: string, name = id): OAuthProvider {
  return {
    cli_command: `hermes login ${id}`,
    docs_url: `https://example.com/${id}`,
    flow: 'pkce',
    id,
    name,
    status: { logged_in: false }
  }
}

function setProviders(providers: OAuthProvider[], overrides: Partial<DesktopOnboardingState> = {}) {
  $desktopOnboarding.set({
    configured: false,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false,
    ...overrides
  } satisfies DesktopOnboardingState)
}

const ctx: OnboardingContext = { requestGateway: async () => undefined as never }

afterEach(() => {
  cleanup()

  try {
    window.localStorage.clear()
  } catch {
    // jsdom localStorage should always be present; ignore if not.
  }

  $desktopOnboarding.set({
    configured: null,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  })
})

describe('onboarding Picker', () => {
  it('shows only the ready free trial and recommended ChatGPT choices on first run', () => {
    setProviders([
      provider('anthropic', 'Anthropic Claude'),
      provider('openai-codex', 'OpenAI Codex / ChatGPT'),
      provider('nous', 'Nous Portal')
    ])
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Đã sẵn sàng dùng thử miễn phí — không cần làm gì thêm')).toBeTruthy()
    expect(screen.getByText('Dùng được ngay, có giới hạn lượt hỏi mỗi giờ. Phù hợp để làm quen phần mềm.')).toBeTruthy()
    expect(screen.getByText('Đăng nhập ChatGPT (khuyên dùng)')).toBeTruthy()
    expect(
      screen.getByText(
        'Đăng nhập bằng tài khoản ChatGPT của bạn — không giới hạn lượt, phản hồi chính xác hơn cho việc quan trọng.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    // Fireworks stays behind the disclosure with the other alternatives; only
    // Nous Portal is visible before the user expands the list.
    expect(screen.queryByText('Fireworks AI')).toBeNull()
    expect(screen.queryByText('OpenAI OAuth (ChatGPT)')).toBeNull()
    expect(screen.queryByText('Nous Portal')).toBeNull()
    expect(screen.queryByText('OpenRouter')).toBeNull()
    expect(screen.queryByText('Anthropic API Key')).toBeNull()
  })

  it('keeps the full provider picker in manual mode', () => {
    setProviders([
      provider('openai-codex', 'OpenAI Codex / ChatGPT'),
      provider('minimax-oauth', 'MiniMax'),
      provider('nous', 'Nous Portal')
    ], { manual: true })
    render(<Picker ctx={ctx} />)
    fireEvent.click(screen.getByRole('button', { name: 'Other providers' }))

    const labels = screen
      .getAllByRole('button')
      .map(el => el.textContent ?? '')
      .filter(text => /Nous Portal|Fireworks AI|ChatGPT or Codex|MiniMax|OpenRouter/.test(text))

    const indexOf = (needle: string) => labels.findIndex(text => text.includes(needle))
    expect(indexOf('ChatGPT or Codex')).toBe(0)
    expect(indexOf('Fireworks AI')).toBe(1)
    expect(indexOf('Nous Portal')).toBeGreaterThan(indexOf('Fireworks AI'))
    expect(indexOf('MiniMax')).toBeGreaterThan(indexOf('ChatGPT or Codex'))
  })

  it('shows every provider directly in manual mode when no Featured provider is present', () => {
    setProviders([provider('anthropic', 'Anthropic Claude'), provider('minimax-oauth', 'MiniMax')], { manual: true })
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Fireworks AI')).toBeTruthy()
    expect(screen.getByText('Anthropic API Key')).toBeTruthy()
    expect(screen.getByText('MiniMax')).toBeTruthy()
    expect(screen.queryByText('Other sign-in options')).toBeNull()
    expect(screen.queryByText('Recommended')).toBeNull()
  })

  it('does not offer choose-later on the default first-run path', () => {
    setProviders([provider('openai-codex', 'OpenAI Codex / ChatGPT')])
    render(<Picker ctx={ctx} />)

    expect(screen.queryByRole('button', { name: "I'll choose a provider later" })).toBeNull()
  })

  it('hides "choose later" in manual (add-provider) mode', () => {
    setProviders([provider('nous', 'Nous Portal')], { manual: true })
    render(<Picker ctx={ctx} />)

    expect(screen.queryByRole('button', { name: "I'll choose a provider later" })).toBeNull()
  })

  it('preselects OpenRouter when the quota fallback opens the key form', () => {
    setProviders([provider('openai-codex', 'OpenAI Codex / ChatGPT')])
    $desktopOnboarding.set({ ...$desktopOnboarding.get(), mode: 'apikey' })

    render(<Picker ctx={ctx} initialApiKeyEnv="OPENROUTER_API_KEY" />)

    expect(screen.getByText('OpenRouter')).toBeTruthy()
    expect(screen.getByPlaceholderText('Paste API key')).toBeTruthy()
  })
})
