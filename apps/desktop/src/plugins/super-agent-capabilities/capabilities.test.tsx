import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CAPABILITY_PILLS,
  CAPABILITY_SOURCES,
  classifySkill,
  CapabilitiesView,
  capabilitiesPlugin,
  type CapabilitySkill
} from './capabilities'
import { launchCapability, loadWorkMemoryLabels, mergeNativeConnections } from './api'

const { request, navigate, loadCapabilities, toggleCapability, getStarmapGraph } = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  loadCapabilities: vi.fn(),
  toggleCapability: vi.fn(),
  getStarmapGraph: vi.fn()
}))

vi.mock('@hermes/plugin-sdk', () => ({
  ROUTES_AREA: 'routes',
  SIDEBAR_NAV_AREA: 'sidebar.nav',
  host: {
    request,
    navigate,
    state: { cwd: { get: vi.fn(() => '') } }
  }
}))

vi.mock('@/hermes', () => ({ getStarmapGraph }))

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, loadCapabilities, toggleCapability }
})

afterEach(() => {
  cleanup()
  request.mockReset()
  navigate.mockReset()
  loadCapabilities.mockReset()
  toggleCapability.mockReset()
  getStarmapGraph.mockReset()
  getStarmapGraph.mockResolvedValue({ nodes: [] })
})

const skill = (overrides: Partial<CapabilitySkill> = {}): CapabilitySkill => ({
  category: 'documents',
  description: 'Đọc và tóm tắt tài liệu.',
  enabled: true,
  name: 'summarize-document',
  provenance: 'agent',
  ...overrides
})

describe('Super Agent capabilities page', () => {
  it('uses the app card token in all source-header tint declarations', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/plugins/super-agent-capabilities/capabilities.css'), 'utf8')
    const headerRules = css.split('\n').filter(line => line.includes('.sa-capability-card__header'))

    expect(headerRules).toHaveLength(4)
    expect(headerRules.every(line => line.includes('var(--color-card)'))).toBe(true)
  })

  it('loads only non-empty work memory labels from the Starmap graph', async () => {
    getStarmapGraph.mockResolvedValueOnce({
      nodes: [
        { kind: 'memory', label: 'Chủ một xưởng in nhỏ' },
        { kind: 'memory', label: 'Viết ngắn, không hoa mỹ' },
        { kind: 'memory', label: 'Báo cáo quý 3 dùng được ngay' },
        { kind: 'skill', label: 'Tóm tắt tài liệu' },
        { kind: 'memory', label: '   ' }
      ]
    })

    await expect(loadWorkMemoryLabels()).resolves.toEqual(['Chủ một xưởng in nhỏ'])
  })

  it('adds the three native connections when the skills API omits native tools', () => {
    const merged = mergeNativeConnections([skill({ name: 'existing-skill' })])

    expect(merged.map(item => item.name)).toEqual(['existing-skill', 'web_search', 'image_generate', 'text_to_speech'])
    expect(merged.slice(1).every(item => item.readiness_status === 'setup_needed')).toBe(true)
  })

  it('falls back to an empty context when the Starmap graph cannot be read', async () => {
    getStarmapGraph.mockRejectedValueOnce(new Error('graph unavailable'))

    await expect(loadWorkMemoryLabels()).resolves.toEqual([])
  })

  it('keeps the four source labels and planned work-area filters', () => {
    expect(CAPABILITY_SOURCES.map(source => source.label)).toEqual([
      'Hermes gốc',
      'Super Agent',
      'Từ kho Hermes',
      'Của bạn'
    ])
    expect(CAPABILITY_PILLS.map(pill => pill.label)).toEqual([
      'Tất cả',
      'Tài liệu',
      'Nội dung marketing',
      'Nghiên cứu',
      'Học tập',
      'Đào tạo'
    ])
  })

  it('registers the main navigation route without claiming /skills', () => {
    const contributions: Array<{ area: string; data?: { path?: string } }> = []

    capabilitiesPlugin.register({
      registerMany: (entries: Array<{ area: string; data?: unknown }>) =>
        contributions.push(...entries.map(entry => ({ area: entry.area, data: entry.data as { path?: string } })))
    } as never)

    expect(contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'routes', data: expect.objectContaining({ path: '/nang-luc' }) }),
        expect.objectContaining({ area: 'sidebar.nav', data: expect.objectContaining({ path: '/nang-luc' }) })
      ])
    )
    expect(contributions.some(contribution => contribution.data?.path === '/skills')).toBe(false)
  })

  it('classifies API provenance without reading created_by', () => {
    expect(classifySkill(skill({ provenance: 'bundled' })).source.id).toBe('hermes')
    expect(classifySkill(skill({ provenance: 'hub' })).source.id).toBe('hub')
    expect(classifySkill(skill({ provenance: 'agent' })).source.id).toBe('mine')
    expect(classifySkill(skill({ provenance: 'agent', name: 'sa-office-report' }), ['sa-office-report']).source.id).toBe(
      'sa'
    )
    expect(classifySkill(skill({ provenance: 'bundled', category: 'documents' })).layer).toBe('platform')
    expect(classifySkill(skill({ provenance: 'agent', category: 'system' })).layer).toBe('work')
    expect(classifySkill(skill({ readiness_status: 'setup_needed', provenance: 'agent' })).layer).toBe('connection')
  })

  it('renders work cards, filters them, and keeps the platform row collapsed', async () => {
    loadCapabilities.mockResolvedValueOnce({
      skills: [
        skill({ name: 'summarize-document', category: 'documents' }),
        skill({ name: 'marketing-copy', category: 'marketing', description: 'Viết nội dung marketing.' }),
        skill({ name: 'browser', category: 'system', provenance: 'bundled' })
      ],
      superAgentNames: [],
      readinessStatusAvailable: false
    })

    render(<CapabilitiesView />)

    expect(await screen.findByText('Năng lực của Siêu trợ lý')).toBeTruthy()
    expect(screen.getByText('Tóm tắt tài liệu')).toBeTruthy()
    expect(screen.getByText('Viết nội dung marketing.')).toBeTruthy()
    expect(screen.getByText(/Nền tảng/)).toBeTruthy()
    expect(screen.queryByText('browser')).toBeNull()
    expect(screen.getByText('Chưa có dữ liệu kết nối cần thiết lập từ contract hiện tại.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Nền tảng/ }))
    expect(screen.getByText('Browser')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Nội dung marketing/ }))
    expect(screen.getByText('Viết nội dung marketing.')).toBeTruthy()
    expect(screen.queryByText('Tóm tắt tài liệu')).toBeNull()
  })

  it('renders the three approved connection cards with all three content sections and work context', async () => {
    loadCapabilities.mockResolvedValueOnce({
      skills: [
        skill({ name: 'web_search', description: 'Đọc web' }),
        skill({ name: 'image_generate', description: 'Tạo ảnh' }),
        skill({ name: 'text_to_speech', description: 'Tạo giọng nói' })
      ],
      superAgentNames: [],
      readinessStatusAvailable: false
    })
    getStarmapGraph.mockResolvedValueOnce({ nodes: [{ kind: 'memory', label: 'Chủ một xưởng in nhỏ' }] })

    render(<CapabilitiesView />)

    expect(await screen.findByText('Đọc web')).toBeTruthy()
    expect(screen.getByText('Tìm kiếm và đọc nội dung từ web — tra thông tin, tìm bài viết, trích nội dung từ 1 trang cụ thể (kể cả file PDF) mà không cần tự mở từng trang.')).toBeTruthy()
    expect(screen.getByText('Chọn 1 nhà cung cấp tìm kiếm/đọc web trong Cài đặt (có gói miễn phí), nhập mã.')).toBeTruthy()
    expect(screen.getByText('Hữu ích khi bạn cần tra thông tin cho Chủ một xưởng in nhỏ mà không muốn tự đọc từng trang.')).toBeTruthy()
    expect(screen.getByText('Hữu ích khi bạn cần hình ảnh nhanh cho Chủ một xưởng in nhỏ.')).toBeTruthy()
    expect(screen.getByText('Hữu ích khi bạn cần biến nội dung thành audio cho Chủ một xưởng in nhỏ.')).toBeTruthy()
    expect(screen.getByText('Tạo ảnh minh hoạ')).toBeTruthy()
    expect(screen.getByText('Tạo giọng nói')).toBeTruthy()
  })

  it('uses approved static benefit copy when the work memory graph is empty', async () => {
    loadCapabilities.mockResolvedValueOnce({ skills: [skill({ name: 'web_search' })], superAgentNames: [], readinessStatusAvailable: false })

    render(<CapabilitiesView />)

    expect(await screen.findByText('Đọc web')).toBeTruthy()
    expect(screen.getByText('Hữu ích khi bạn cần tổng hợp thông tin từ nhiều trang mà không muốn tự đọc từng cái.')).toBeTruthy()
  })

  it('renders a dedicated header region for each source card', async () => {
    loadCapabilities.mockResolvedValueOnce({
      skills: [
        skill({ name: 'sa-card', provenance: 'agent' }),
        skill({ name: 'hub-card', provenance: 'hub' }),
        skill({ name: 'mine-card', provenance: 'agent' })
      ],
      superAgentNames: ['sa-card'],
      readinessStatusAvailable: false
    })

    const { container } = render(<CapabilitiesView />)

    await screen.findByText('Sa Card')

    const cards = Array.from(container.querySelectorAll('.sa-capability-card'))
    expect(cards).toHaveLength(3)
    expect(cards.map(card => card.getAttribute('data-source'))).toEqual(['sa', 'hub', 'mine'])
    expect(cards.every(card => card.querySelector('.sa-capability-card__header'))).toBe(true)
  })

  it('shows a truthful loading and error state', async () => {
    loadCapabilities.mockRejectedValueOnce(new Error('skills unavailable'))

    render(<CapabilitiesView />)

    expect(screen.getByText('Đang tải năng lực…')).toBeTruthy()
    expect(await screen.findByText('Không tải được danh sách năng lực.')).toBeTruthy()
  })

  it('launches a skill through dispatch, submits the returned message, and navigates', async () => {
    request
      .mockResolvedValueOnce({ session_id: 'runtime-1', stored_session_id: 'stored-1' })
      .mockResolvedValueOnce({ type: 'skill', message: 'skill kickoff' })
      .mockResolvedValueOnce({ status: 'streaming' })

    await launchCapability('summarize-document')

    expect(request.mock.calls.map(([method]) => method)).toEqual(['session.create', 'command.dispatch', 'prompt.submit'])
    expect(request).toHaveBeenNthCalledWith(2, 'command.dispatch', {
      session_id: 'runtime-1',
      name: 'summarize-document',
      arg: ''
    })
    expect(request).toHaveBeenNthCalledWith(3, 'prompt.submit', { session_id: 'runtime-1', text: 'skill kickoff' })
    expect(navigate).toHaveBeenCalledWith('/stored-1')
  })

  it('wires the skill toggle contract to the management control', async () => {
    loadCapabilities.mockResolvedValueOnce({ skills: [skill()], superAgentNames: [], readinessStatusAvailable: false })
    toggleCapability.mockResolvedValueOnce(undefined)

    render(<CapabilitiesView />)
    await screen.findByText('Tóm tắt tài liệu')
    fireEvent.click(screen.getByRole('button', { name: 'Tắt Tóm tắt tài liệu' }))

    expect(toggleCapability).toHaveBeenCalledWith('summarize-document', false)
    expect(await screen.findByText('Đã tắt năng lực.')).toBeTruthy()
  })
})
