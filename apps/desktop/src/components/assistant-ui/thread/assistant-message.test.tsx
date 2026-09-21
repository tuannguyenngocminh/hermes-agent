// Bug #2: the Branch-in-new-chat button used to render unconditionally even
// when its handler was a no-op (session-tile.tsx passed `() => undefined`
// for branched/tiled chats, where nested branching isn't supported). That
// left a visibly clickable button that silently did nothing. The fix makes
// AssistantMessage's action bar hide the button entirely when no handler is
// supplied, matching how onDismissError/onRestoreToMessage already behave.
import { AssistantRuntimeProvider, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $displayTimestamps } from '@/store/display-timestamps'

const { startManualProviderOAuth, startManualOnboarding, openExternalLink } = vi.hoisted(() => ({
  startManualProviderOAuth: vi.fn(),
  startManualOnboarding: vi.fn(),
  openExternalLink: vi.fn()
}))

vi.mock('@/store/onboarding', () => ({ startManualOnboarding, startManualProviderOAuth }))
vi.mock('@/lib/external-link', () => ({ openExternalLink }))

import { formatTimelineRange, formatTimelineTimestamp } from './timestamp'

import { Thread } from '.'

// Timeline timestamps render only when `display.timestamps` is enabled.
$displayTimestamps.set(true)

const createdAt = new Date('2026-05-01T00:00:00.000Z')
const completedAt = createdAt.getTime() / 1000 + 1.25

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', TestResizeObserver)
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(performance.now()), 0)
)
vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
vi.stubGlobal('CSS', { escape: (str: string) => str })

Element.prototype.scrollTo = function scrollTo() {}

afterEach(() => {
  cleanup()
})

function userMessage(): ThreadMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', text: 'question one' }],
    attachments: [],
    createdAt,
    metadata: { custom: { timelineTimestamp: createdAt.getTime() / 1000 } }
  } as unknown as ThreadMessage
}

function assistantMessage(): ThreadMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'checked carefully',
        timestamp: createdAt.getTime() / 1000 + 0.05,
        completedAt: createdAt.getTime() / 1000 + 0.1
      },
      {
        type: 'text',
        text: 'done',
        timestamp: createdAt.getTime() / 1000 + 0.125,
        completedAt: createdAt.getTime() / 1000 + 0.5
      }
    ],
    status: { type: 'complete', reason: 'stop' },
    createdAt,
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: { timelineCompletedAt: completedAt, timelineTimestamp: createdAt.getTime() / 1000 }
    }
  } as unknown as ThreadMessage
}

function kiloExhaustedAssistantMessage(): ThreadMessage {
  return {
    id: 'assistant-kilo-exhausted',
    role: 'assistant',
    content: [],
    status: { type: 'incomplete', reason: 'error', error: 'Lượt dùng thử miễn phí hôm nay đã hết.' },
    createdAt,
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: { errorCode: 'kilo_fallback_exhausted' }
    }
  } as unknown as ThreadMessage
}

function Harness({
  assistant = assistantMessage(),
  onBranchInNewChat,
  onDismissError
}: {
  assistant?: ThreadMessage
  onBranchInNewChat?: (messageId: string) => void
  onDismissError?: (messageId: string) => void
}) {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages: [userMessage(), assistant],
    isRunning: false,
    onNew: async () => {}
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread onBranchInNewChat={onBranchInNewChat} onDismissError={onDismissError} />
    </AssistantRuntimeProvider>
  )
}

describe('AssistantMessage branch button visibility (bug #2 fix)', () => {
  it('shows the Branch in new chat button when a handler is provided (open chat)', async () => {
    render(<Harness onBranchInNewChat={() => undefined} />)

    expect(await screen.findByRole('button', { name: 'Branch in new chat' })).toBeTruthy()
  })

  it('hides the Branch in new chat button when no handler is provided (session-tile / branched chat)', async () => {
    render(<Harness />)

    // Wait for the assistant message to actually mount before asserting
    // absence, so a missing button isn't just a false negative from an
    // unrendered message.
    await screen.findByText('done')

    expect(screen.queryByRole('button', { name: 'Branch in new chat' })).toBeNull()
  })
})

describe('message timeline timestamps', () => {
  it('always renders precise user and assistant lifecycle times', async () => {
    const { container } = render(<Harness />)

    await screen.findByText('done')

    const stamps = Array.from(container.querySelectorAll('[data-slot="timeline-timestamp"]')).map(node =>
      node.textContent?.trim()
    )

    const startedAt = createdAt.getTime() / 1000

    expect(stamps).toContain(formatTimelineTimestamp(startedAt))
    expect(stamps).toContain(formatTimelineRange(startedAt, completedAt))
    expect(stamps).toContain(formatTimelineRange(startedAt + 0.05, startedAt + 0.1))
    expect(stamps).toContain(formatTimelineRange(startedAt + 0.125, startedAt + 0.5))
  })

  it('suppresses an aggregate assistant stamp that exactly duplicates its sole part', async () => {
    const startedAt = createdAt.getTime() / 1000

    const assistant = {
      ...assistantMessage(),
      content: [{ completedAt, text: 'done', timestamp: startedAt, type: 'text' }]
    } as unknown as ThreadMessage

    const { container } = render(<Harness assistant={assistant} />)

    await screen.findByText('done')

    const stamps = Array.from(container.querySelectorAll('[data-slot="timeline-timestamp"]')).map(node =>
      node.textContent?.trim()
    )

    expect(stamps.filter(stamp => stamp === formatTimelineRange(startedAt, completedAt))).toHaveLength(1)
  })
})

describe('Kilo fallback exhaustion card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows exactly two actions and routes them through existing onboarding/external-link seams', async () => {
    render(<Harness assistant={kiloExhaustedAssistantMessage()} />)

    expect(await screen.findByText('Lượt dùng thử miễn phí hôm nay đã hết.')).toBeTruthy()
    const actions = screen.getAllByRole('button', { name: /ChatGPT|Gemini/i })

    expect(actions).toHaveLength(2)
    expect(actions.map(action => action.textContent)).toEqual([
      'Đăng nhập ChatGPT (khuyên dùng)',
      'Lấy key Google Gemini miễn phí'
    ])

    fireEvent.click(actions[0])
    expect(startManualProviderOAuth).toHaveBeenCalledWith('openai-codex', expect.any(String))

    fireEvent.click(actions[1])
    expect(openExternalLink).toHaveBeenCalledWith('https://aistudio.google.com/app/apikey')
    expect(startManualOnboarding).toHaveBeenCalledWith(expect.any(String))
  })

  it('provides a dismiss button that reuses the existing error dismissal callback', async () => {
    const onDismissError = vi.fn()

    render(<Harness assistant={kiloExhaustedAssistantMessage()} onDismissError={onDismissError} />)

    const dismiss = await screen.findByRole('button', { name: 'Dismiss error' })

    fireEvent.click(dismiss)

    expect(onDismissError).toHaveBeenCalledTimes(1)
    expect(onDismissError).toHaveBeenCalledWith('assistant-kilo-exhausted')
  })

  it('keeps all three actions keyboard-reachable and activates them through native buttons', async () => {
    const onDismissError = vi.fn()

    render(<Harness assistant={kiloExhaustedAssistantMessage()} onDismissError={onDismissError} />)

    const card = await screen.findByRole('alert')
    const buttons = within(card).getAllByRole('button')

    expect(buttons).toHaveLength(3)
    expect(buttons.every(button => button.getAttribute('type') === 'button')).toBe(true)

    buttons.forEach(button => {
      button.focus()
      expect(globalThis.document.activeElement).toBe(button)
    })

    // jsdom does not synthesize a browser's default keyboard click. Send the
    // real key events before the native click each browser would generate.
    fireEvent.keyDown(buttons[0], { key: 'Enter', code: 'Enter' })
    fireEvent.keyUp(buttons[0], { key: 'Enter', code: 'Enter' })
    fireEvent.click(buttons[0])
    fireEvent.keyDown(buttons[1], { key: ' ', code: 'Space' })
    fireEvent.keyUp(buttons[1], { key: ' ', code: 'Space' })
    fireEvent.click(buttons[1])
    fireEvent.keyDown(buttons[2], { key: 'Enter', code: 'Enter' })
    fireEvent.keyUp(buttons[2], { key: 'Enter', code: 'Enter' })
    fireEvent.click(buttons[2])

    expect(startManualProviderOAuth).toHaveBeenCalledTimes(1)
    expect(openExternalLink).toHaveBeenCalledTimes(1)
    expect(startManualOnboarding).toHaveBeenCalledTimes(1)
    expect(onDismissError).toHaveBeenCalledTimes(1)
  })
})
