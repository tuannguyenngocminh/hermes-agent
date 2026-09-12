import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as HermesApi from '@/hermes'

const cronMocks = vi.hoisted(() => ({
  getCronJobs: vi.fn(),
  triggerCronJob: vi.fn(),
  updateCronJob: vi.fn()
}))

const notificationMocks = vi.hoisted(() => ({
  notifyError: vi.fn()
}))

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<typeof HermesApi>()),
  ...cronMocks
}))

vi.mock('@/store/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/store/notifications')>()),
  notifyError: notificationMocks.notifyError
}))

// eslint-disable-next-line no-restricted-imports -- test resets the bundled plugin's shared host state.
import { $assistantPaneTab } from '@/store/assistant-pane'

import { AssistantPane } from './assistant-pane'

const B1_PROMPT = '/sieu-tro-ly-ra-soat-hang-ngay'

function cronJob(expr: string, id = 'b1-job') {
  return {
    deliver: 'local',
    enabled: true,
    id,
    prompt: B1_PROMPT,
    schedule: { expr }
  }
}

afterEach(() => {
  cleanup()
  $assistantPaneTab.set('review')
})

beforeEach(() => {
  cronMocks.getCronJobs.mockResolvedValue([])
  cronMocks.triggerCronJob.mockResolvedValue(undefined)
  cronMocks.updateCronJob.mockImplementation(async (id: string, updates: { schedule: string }) => cronJob(updates.schedule, id))
  vi.clearAllMocks()
})

describe('Super Agent assistant pane', () => {
  it('renders the three planned tabs with Review selected by default', () => {
    render(<AssistantPane />)

    expect(screen.getByRole('tab', { name: 'Tự Nâng Cấp' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Hỏi đáp' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Tạo việc mới' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tabpanel').textContent).toContain('Chưa có bản rà soát mới')
  })

  it('renders the exact self-upgrade explanation and five new section headings', () => {
    render(<AssistantPane />)

    expect(
      screen.getByText(
        'Tính năng giúp bạn vượt trội hơn 90% người dùng AI hiện tại, mỗi ngày sử dụng công cụ thành thạo hơn, tiết kiệm được nhiều thời gian hơn. Siêu trợ lý sẽ đề xuất cho bạn cách sử dụng các công nghệ tiên tiến nhất, quy trình làm việc tối ưu nhất để hoàn thành các công việc của bạn hiệu quả hơn, đơn giản hơn, tối ưu hơn và vượt xa đối thủ.'
      )
    ).toBeTruthy()

    for (const heading of [
      'Thành quả đã đạt được',
      'Mách bạn',
      'Năng lực nên mở khoá thêm',
      'Công nghệ hữu ích cho bạn',
      'Quy trình của chuyên gia'
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }

    expect(screen.queryByRole('heading', { name: 'Tư vấn chọn model' })).toBeNull()
  })

  it.each([
    ['0 7 * * *', 'Hằng ngày'],
    ['0 7 */3 * *', '3 ngày'],
    ['0 7 * * 1', 'Hằng tuần']
  ])('selects the cadence mapped from the B1 schedule expression %s', async (expr, label) => {
    cronMocks.getCronJobs.mockResolvedValue([cronJob(expr)])

    render(<AssistantPane />)

    await waitFor(() => expect(cronMocks.getCronJobs).toHaveBeenCalledOnce())
    await waitFor(() => expect((screen.getByRole('radio', { name: label }) as HTMLInputElement).checked).toBe(true))
  })

  it.each([
    ['0 7 2 * *', [cronJob('0 7 2 * *')]],
    ['zero matching jobs', []]
  ])('leaves every cadence radio unselected for %s', async (_caseName, jobs) => {
    cronMocks.getCronJobs.mockResolvedValue(jobs)

    render(<AssistantPane />)

    await waitFor(() => expect(cronMocks.getCronJobs).toHaveBeenCalledOnce())
    for (const label of ['Hằng ngày', '3 ngày', 'Hằng tuần']) {
      expect((screen.getByRole('radio', { name: label }) as HTMLInputElement).checked).toBe(false)
    }
  })

  it('shows a user-friendly message when the B1 job is unavailable', async () => {
    render(<AssistantPane />)

    await waitFor(() => expect(cronMocks.getCronJobs).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('radio', { name: '3 ngày' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tự nâng cấp ngay' }))

    const expectedMessage = 'Lịch Tự Nâng Cấp chưa sẵn sàng. Vui lòng mở lại ứng dụng rồi thử lại.'
    await waitFor(() => expect(notificationMocks.notifyError).toHaveBeenCalledTimes(2))
    expect(notificationMocks.notifyError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: expectedMessage }),
      'Không thể đổi nhịp độ Tự Nâng Cấp'
    )
    expect(notificationMocks.notifyError).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ message: expectedMessage }),
      'Không thể chạy Tự Nâng Cấp ngay'
    )
  })

  it('updates only the B1 schedule when cadence changes and triggers the same job on demand', async () => {
    cronMocks.getCronJobs.mockResolvedValue([cronJob('0 7 * * *')])
    cronMocks.updateCronJob.mockResolvedValue(cronJob('0 7 */3 * *'))

    render(<AssistantPane />)

    await waitFor(() => expect((screen.getByRole('radio', { name: 'Hằng ngày' }) as HTMLInputElement).checked).toBe(true))
    fireEvent.click(screen.getByRole('radio', { name: '3 ngày' }))

    await waitFor(() => expect(cronMocks.updateCronJob).toHaveBeenCalledWith('b1-job', { schedule: '0 7 */3 * *' }))
    await waitFor(() => expect((screen.getByRole('radio', { name: '3 ngày' }) as HTMLInputElement).checked).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Tự nâng cấp ngay' }))
    await waitFor(() => expect(cronMocks.triggerCronJob).toHaveBeenCalledWith('b1-job'))
  })

  it('does not update the cron job when the selected cadence is unchanged', async () => {
    cronMocks.getCronJobs.mockResolvedValue([cronJob('0 7 * * *')])

    render(<AssistantPane />)

    await waitFor(() => expect((screen.getByRole('radio', { name: 'Hằng ngày' }) as HTMLInputElement).checked).toBe(true))
    fireEvent.click(screen.getByRole('radio', { name: 'Hằng ngày' }))

    expect(cronMocks.updateCronJob).not.toHaveBeenCalled()
  })

  it('changes the active panel when a user selects another tab', () => {
    render(<AssistantPane />)

    fireEvent.click(screen.getByRole('tab', { name: 'Hỏi đáp' }))

    expect(screen.getByRole('tab', { name: 'Hỏi đáp' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toContain('Hỏi Siêu trợ lý')
    expect(screen.getByRole('tabpanel').textContent).not.toContain('Chưa có bản rà soát mới')
  })

  it('shows the B3 placeholder without triggering a workflow side effect', () => {
    render(<AssistantPane />)

    fireEvent.click(screen.getByRole('tab', { name: 'Tạo việc mới' }))

    expect(screen.getByRole('tabpanel').textContent).toContain('Kể tôi nghe một việc')
    expect(screen.getByRole('tabpanel').textContent).toContain('chưa sẵn sàng')
  })

  it('uses the design-system orb for collapsed state and reopens without losing the active tab', () => {
    const onToggleCollapse = vi.fn()
    const onClose = vi.fn()
    const onPointerDown = vi.fn()

    const { rerender } = render(
      <AssistantPane
        renderContext={{
          floating: {
            collapsed: false,
            onClose,
            onToggleCollapse,
            dragHandleProps: {
              onPointerDown,
              onPointerMove: vi.fn(),
              onPointerUp: vi.fn(),
              style: { touchAction: 'none' }
            }
          }
        }}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Hỏi đáp' }))
    expect(screen.getByRole('tab', { name: 'Hỏi đáp' }).getAttribute('aria-selected')).toBe('true')

    rerender(
      <AssistantPane
        renderContext={{
          floating: {
            collapsed: true,
            onClose,
            onToggleCollapse,
            dragHandleProps: {
              onPointerDown,
              onPointerMove: vi.fn(),
              onPointerUp: vi.fn(),
              style: { touchAction: 'none' }
            }
          }
        }}
      />
    )

    expect(screen.getByRole('button', { name: 'Mở Siêu trợ lý' }).querySelector('svg')).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mở Siêu trợ lý' }))
    expect(onPointerDown).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Mở Siêu trợ lý' }))
    expect(onToggleCollapse).toHaveBeenCalledOnce()

    rerender(
      <AssistantPane
        renderContext={{
          floating: {
            collapsed: false,
            onClose,
            onToggleCollapse,
            dragHandleProps: {
              onPointerDown,
              onPointerMove: vi.fn(),
              onPointerUp: vi.fn(),
              style: { touchAction: 'none' }
            }
          }
        }}
      />
    )
    expect(screen.getByRole('tab', { name: 'Hỏi đáp' }).getAttribute('aria-selected')).toBe('true')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders the same custom header for a docked pane without floating controls', () => {
    const onClose = vi.fn()

    render(<AssistantPane renderContext={{ docked: { onClose } }} />)

    expect(screen.getByText('Siêu trợ lý')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Thu gọn' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('collapses the floating pane when the user clicks Close', () => {
    const onClose = vi.fn()
    const onToggleCollapse = vi.fn()

    render(
      <AssistantPane
        renderContext={{
          floating: {
            collapsed: false,
            onClose,
            onToggleCollapse,
            dragHandleProps: {
              onPointerDown: vi.fn(),
              onPointerMove: vi.fn(),
              onPointerUp: vi.fn(),
              style: { touchAction: 'none' }
            }
          }
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))

    expect(onToggleCollapse).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })
})
