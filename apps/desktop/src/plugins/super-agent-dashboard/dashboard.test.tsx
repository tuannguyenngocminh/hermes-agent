import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardView, DASHBOARD_PILLS, WORK_CARDS } from './dashboard'

const { request, navigate } = vi.hoisted(() => ({ request: vi.fn(), navigate: vi.fn() }))
const { getUsageAnalytics, listSessions } = vi.hoisted(() => ({ getUsageAnalytics: vi.fn(), listSessions: vi.fn() }))

vi.mock('@hermes/plugin-sdk', () => ({
  host: {
    navigate,
    request,
    state: { cwd: { get: () => '' } }
  }
}))

vi.mock('@/hermes', () => ({ getUsageAnalytics, listSessions }))

afterEach(() => {
  cleanup()
  request.mockReset()
  navigate.mockReset()
  getUsageAnalytics.mockReset()
  listSessions.mockReset()
})

beforeEach(() => {
  getUsageAnalytics.mockResolvedValue({
    daily: [],
    period_days: 1,
    totals: { total_actual_cost: 0 }
  })
  listSessions.mockResolvedValue({ sessions: [], total: 0, limit: 50, offset: 0 })
})

describe('Super Agent work dashboard', () => {
  it('exposes the planned work areas and cards', () => {
    expect(DASHBOARD_PILLS.map(pill => pill.label)).toEqual([
      'Tất cả',
      'Tài liệu',
      'Marketing',
      'Nghiên cứu',
      'Học tập',
      'Đào tạo'
    ])
    expect(WORK_CARDS.length).toBeGreaterThanOrEqual(3)
  })

  it('filters cards by pill and starts a selected work item', async () => {
    request.mockResolvedValueOnce({ session_id: 'runtime-1', stored_session_id: 'stored-1' })
    request.mockResolvedValueOnce(undefined)

    render(<DashboardView />)

    fireEvent.click(screen.getByRole('button', { name: 'Tài liệu' }))
    expect(screen.getByText('Tóm tắt tài liệu')).toBeTruthy()
    expect(screen.queryByText('Viết bài quảng cáo')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu Tóm tắt tài liệu' }))

    expect(await screen.findByText(/Đang mở phiên/)).toBeTruthy()
    expect(request).toHaveBeenCalledWith('session.create', expect.any(Object))
    expect(request).not.toHaveBeenCalledWith('command.dispatch', expect.anything())
    expect(request).toHaveBeenCalledWith('prompt.submit', {
      session_id: 'runtime-1',
      text: 'Hãy giúp tôi tóm tắt tài liệu tôi cung cấp thành các ý chính và việc cần làm.'
    })
    expect(navigate).toHaveBeenCalledWith('/stored-1')
  })

  it('loads today cost from one-day usage analytics and keeps it stable across pill filters', async () => {
    const today = new Date().toISOString().slice(0, 10)

    getUsageAnalytics.mockResolvedValueOnce({
      daily: [{ estimated_cost: 1.23, day: today }],
      period_days: 1,
      totals: { total_estimated_cost: 1.23 }
    })

    render(<DashboardView />)

    expect(screen.getByText('Chi phí ước tính hôm nay')).toBeTruthy()
    expect(await screen.findByText('$1.23')).toBeTruthy()
    expect(getUsageAnalytics).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: 'Tài liệu' }))
    await waitFor(() => expect(getUsageAnalytics).toHaveBeenCalledTimes(1))
    expect(screen.getByText('$1.23')).toBeTruthy()
  })

  it('shows loading state without a fake cost while usage analytics is pending', () => {
    getUsageAnalytics.mockReturnValueOnce(new Promise(() => undefined))

    render(<DashboardView />)

    const costSummary = screen.getByText(/^Chi phí( ước tính)? hôm nay$/).parentElement

    expect(screen.getByText('Đang tải…')).toBeTruthy()
    expect(within(costSummary as HTMLElement).queryByText('$0.00')).toBeNull()
    expect(within(costSummary as HTMLElement).queryByText('--')).toBeNull()
  })

  it('shows an error state without a fake cost when usage analytics fails', async () => {
    getUsageAnalytics.mockRejectedValueOnce(new Error('analytics unavailable'))

    render(<DashboardView />)

    const costSummary = screen.getByText(/^Chi phí( ước tính)? hôm nay$/).parentElement

    expect(await screen.findByText('Không tải được chi phí hôm nay')).toBeTruthy()
    expect(within(costSummary as HTMLElement).queryByText('$0.00')).toBeNull()
    expect(within(costSummary as HTMLElement).queryByText('--')).toBeNull()
  })

  it('loads today sessions, falls back to preview, and excludes yesterday', async () => {
    const now = new Date()
    const todaySeconds = Math.floor(Date.now() / 1000)
    const yesterdaySeconds = todaySeconds - 24 * 60 * 60

    listSessions.mockResolvedValueOnce({
      sessions: [
        {
          id: 'today-titled',
          title: 'Tên phiên hôm nay',
          preview: 'Không dùng preview này',
          started_at: todaySeconds - 600,
          last_active: todaySeconds,
          ended_at: null,
          is_active: true
        },
        {
          id: 'today-preview',
          title: null,
          preview: 'Preview phiên hôm nay',
          started_at: todaySeconds - 1_200,
          last_active: todaySeconds - 300,
          ended_at: todaySeconds - 60,
          is_active: false
        },
        {
          id: 'yesterday',
          title: 'Phiên hôm qua',
          preview: null,
          started_at: yesterdaySeconds,
          last_active: yesterdaySeconds,
          ended_at: yesterdaySeconds + 60,
          is_active: false
        }
      ],
      total: 3,
      limit: 50,
      offset: 0
    })

    render(<DashboardView />)

    expect(listSessions).toHaveBeenCalledWith(50, 1, 'exclude', 'recent')
    expect(await screen.findByText('Tên phiên hôm nay')).toBeTruthy()
    expect(screen.getByText('Preview phiên hôm nay')).toBeTruthy()
    expect(screen.queryByText('Phiên hôm qua')).toBeNull()
    expect(screen.getByText('Đang chạy')).toBeTruthy()
    expect(screen.getByText('Đã hoàn tất')).toBeTruthy()

    const expectedTime = new Date(todaySeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    expect(screen.getByText(expectedTime)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tài liệu' }))
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1))
  })

  it('shows activity loading state without inventing a session', () => {
    listSessions.mockReturnValueOnce(new Promise(() => undefined))

    render(<DashboardView />)

    expect(screen.getByText('Đang tải hoạt động…')).toBeTruthy()
  })

  it('shows activity error state when session loading fails', async () => {
    listSessions.mockRejectedValueOnce(new Error('sessions unavailable'))

    render(<DashboardView />)

    expect(await screen.findByText('Không tải được hoạt động hôm nay')).toBeTruthy()
  })

  it('shows an empty activity state when there are no sessions today', async () => {
    listSessions.mockResolvedValueOnce({ sessions: [], total: 0, limit: 50, offset: 0 })

    render(<DashboardView />)

    expect(await screen.findByText('Chưa có hoạt động hôm nay.')).toBeTruthy()
  })
})
