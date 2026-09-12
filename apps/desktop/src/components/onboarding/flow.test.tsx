import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OAuthProvider } from '@/types/hermes'

import { FlowPanel } from './flow'

const provider: OAuthProvider = {
  cli_command: 'hermes login openai-codex',
  docs_url: 'https://example.com/openai-codex',
  flow: 'pkce',
  id: 'openai-codex',
  name: 'OpenAI Codex / ChatGPT',
  status: { logged_in: false }
}

afterEach(() => cleanup())

describe('FlowPanel OpenAI Codex quota fallback', () => {
  it('shows the approved Vietnamese message and opens OpenRouter directly', () => {
    const onOpenOpenRouter = vi.fn()

    render(
      <FlowPanel
        ctx={{ requestGateway: async () => undefined as never }}
        flow={{
          message: 'HTTP 429 rate_limit_exceeded',
          provider,
          status: 'error'
        }}
        leaving={false}
        onBegin={() => undefined}
        onOpenOpenRouter={onOpenOpenRouter}
      />
    )

    expect(screen.getByText('Hết hạn mức ChatGPT')).toBeTruthy()
    expect(
      screen.getByText('Tài khoản ChatGPT đã dùng hết hạn mức hôm nay. Dùng OpenRouter để tiếp tục (cần API key riêng).')
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dùng OpenRouter' }))

    expect(onOpenOpenRouter).toHaveBeenCalledOnce()
    expect(screen.queryByText('HTTP 429 rate_limit_exceeded')).toBeNull()
  })

  it('shows Vietnamese device-code instructions for OpenAI OAuth', () => {
    render(
      <FlowPanel
        ctx={{ requestGateway: async () => undefined as never }}
        flow={{
          copied: false,
          provider: { ...provider, flow: 'device_code' },
          start: {
            expires_in: 600,
            flow: 'device_code',
            poll_interval: 5,
            session_id: 'session-1',
            user_code: 'ABCD-1234',
            verification_url: 'https://example.com/device'
          },
          status: 'polling'
        }}
        leaving={false}
        onBegin={() => undefined}
      />
    )

    expect(screen.getByText('Đăng nhập bằng OpenAI OAuth (ChatGPT)')).toBeTruthy()
    expect(
      screen.getByText(
        'Ứng dụng đã mở trình duyệt. Hãy đăng nhập ChatGPT trên trình duyệt, nhập mã bên dưới hoặc nhập lại mã nếu được yêu cầu, rồi quay lại ứng dụng và chờ hoàn tất.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mở lại trang xác thực' })).toBeTruthy()
    expect(screen.getByText('Đang chờ hoàn tất xác thực...')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sao chép mã xác thực' })).toBeTruthy()
  })

  it('keeps the normal provider choice for non-quota errors', () => {
    render(
      <FlowPanel
        ctx={{ requestGateway: async () => undefined as never }}
        flow={{ message: 'OAuth callback failed.', provider, status: 'error' }}
        leaving={false}
        onBegin={() => undefined}
        onOpenOpenRouter={() => undefined}
      />
    )

    expect(screen.getByText('OAuth callback failed.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dùng OpenRouter' })).toBeNull()
  })
})
