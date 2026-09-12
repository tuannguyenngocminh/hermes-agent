import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryView } from './memory'
import jarvisSoul from './personas/SOUL-jarvis.md?raw'
import { memoryPlugin } from './plugin'

const { activeProfileStore, getStarmapGraph, getLearningNode, editLearningNode, deleteLearningNode, getProfileSoul, updateProfileSoul } = vi.hoisted(() => ({
  activeProfileStore: (() => {
    let value = 'default'
    const listeners = new Set<() => void>()
    return {
      get: () => value,
      get value() {
        return value
      },
      listen(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set(next: string) {
        value = next
        listeners.forEach(listener => listener())
      }
    }
  })(),
  getStarmapGraph: vi.fn(),
  getLearningNode: vi.fn(),
  editLearningNode: vi.fn(),
  deleteLearningNode: vi.fn(),
  getProfileSoul: vi.fn(),
  updateProfileSoul: vi.fn()
}))

vi.mock('@/hermes', () => ({
  getStarmapGraph,
  getLearningNode,
  editLearningNode,
  deleteLearningNode,
  getProfileSoul,
  updateProfileSoul
}))

vi.mock('@/store/profile', () => ({
  $activeProfile: activeProfileStore,
  normalizeProfileKey: (name: string | null | undefined) => name?.trim() || 'default'
}))

vi.mock('@hermes/plugin-sdk', () => ({
  ROUTES_AREA: 'routes',
  SIDEBAR_NAV_AREA: 'sidebar.nav'
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

beforeEach(() => {
  getStarmapGraph.mockResolvedValue({
    nodes: [
      { id: 'memory:profile:0', label: 'Chủ một xưởng in nhỏ', kind: 'memory', useCount: 0 },
      { id: 'memory:profile:1', label: 'Viết ngắn, không hoa mỹ', kind: 'memory', useCount: 0 },
      { id: 'memory:profile:2', label: 'Báo cáo quý 3 dùng được ngay', kind: 'memory', useCount: 0 },
      { id: 'summarize-document', label: 'Tóm tắt tài liệu', kind: 'skill', useCount: 4 }
    ]
  })
  getLearningNode.mockResolvedValue({ ok: true, kind: 'memory', label: 'Chi tiết', content: 'Nội dung bộ nhớ cũ' })
  editLearningNode.mockResolvedValue({ ok: true, message: 'updated' })
  deleteLearningNode.mockResolvedValue({ ok: true, message: 'deleted' })
  getProfileSoul.mockResolvedValue({ content: '', exists: false })
  updateProfileSoul.mockResolvedValue({ ok: true })
  activeProfileStore.set('default')
})

describe('Super Agent memory page', () => {
  it('loads the copied Jarvis persona through the desktop Vite raw import', () => {
    expect(jarvisSoul).toContain('Jarvis')
  })

  it('registers the /ve-toi route and sidebar entry', () => {
    const registerMany = vi.fn()

    memoryPlugin.register({ registerMany } as never)

    expect(registerMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ area: 'routes', data: expect.objectContaining({ path: '/ve-toi' }) }),
        expect.objectContaining({
          area: 'sidebar.nav',
          data: expect.objectContaining({ label: 'Siêu trợ lý của tôi', path: '/ve-toi' })
        })
      ])
    )
  })

  it('renders the four memory groups from graph nodes', async () => {
    render(<MemoryView />)

    expect(await screen.findByText('Siêu trợ lý của tôi')).toBeTruthy()
    expect(screen.getByText('Công việc của bạn')).toBeTruthy()
    expect(screen.getByText('Cách bạn làm việc')).toBeTruthy()
    expect(screen.getByText('Đã làm & kết quả')).toBeTruthy()
    expect(screen.getByText('Năng lực đã dùng')).toBeTruthy()
    expect(screen.getByText('Chủ một xưởng in nhỏ')).toBeTruthy()
    expect(screen.getByText('Viết ngắn, không hoa mỹ')).toBeTruthy()
    expect(screen.getByText('Báo cáo quý 3 dùng được ngay')).toBeTruthy()
    expect(screen.getByText('Tóm tắt tài liệu')).toBeTruthy()
  })

  it('loads an item and saves edited content through the Hermes mutation', async () => {
    render(<MemoryView />)

    await screen.findByText('Chủ một xưởng in nhỏ')
    fireEvent.click(screen.getByRole('button', { name: 'Sửa Chủ một xưởng in nhỏ' }))

    const editor = await screen.findByRole('textbox', { name: 'Nội dung bộ nhớ' })
    expect((editor as HTMLTextAreaElement).value).toBe('Nội dung bộ nhớ cũ')
    fireEvent.change(editor, { target: { value: 'Nội dung bộ nhớ mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(editLearningNode).toHaveBeenCalledWith('memory:profile:0', 'Nội dung bộ nhớ mới'))
    expect(getStarmapGraph).toHaveBeenCalledTimes(2)
  })

  it('shows a readable error when loading an item for editing fails', async () => {
    getLearningNode.mockRejectedValueOnce(new Error('read failed'))
    render(<MemoryView />)

    await screen.findByText('Chủ một xưởng in nhỏ')
    fireEvent.click(screen.getByRole('button', { name: 'Sửa Chủ một xưởng in nhỏ' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Không mở được nội dung để sửa.')
    expect(screen.queryByRole('textbox', { name: 'Nội dung bộ nhớ' })).toBeNull()
  })

  it('keeps the edit dialog open and shows an error when saving fails', async () => {
    editLearningNode.mockRejectedValueOnce(new Error('write failed'))
    render(<MemoryView />)

    await screen.findByText('Chủ một xưởng in nhỏ')
    fireEvent.click(screen.getByRole('button', { name: 'Sửa Chủ một xưởng in nhỏ' }))
    const editor = await screen.findByRole('textbox', { name: 'Nội dung bộ nhớ' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Không lưu được thay đổi vào bộ nhớ Hermes.')
    })
    expect(screen.getByRole('textbox', { name: 'Nội dung bộ nhớ' })).toBeTruthy()
  })

  it('refetches and shows an error when the delayed delete fails', async () => {
    vi.useFakeTimers()
    deleteLearningNode.mockRejectedValueOnce(new Error('delete failed'))
    render(<MemoryView />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Chủ một xưởng in nhỏ' }))

    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Không xoá được mục khỏi bộ nhớ Hermes.')
    expect(getStarmapGraph).toHaveBeenCalledTimes(2)
  })

  it('keeps a delete undoable for five seconds before calling Hermes delete', async () => {
    vi.useFakeTimers()
    render(<MemoryView />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Chủ một xưởng in nhỏ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Chủ một xưởng in nhỏ' }))

    expect(screen.queryByText('Chủ một xưởng in nhỏ')).toBeNull()
    expect(screen.getByText('Đã xoá — Hoàn tác')).toBeTruthy()
    expect(deleteLearningNode).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(screen.getByText('Chủ một xưởng in nhỏ')).toBeTruthy()
    expect(deleteLearningNode).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Xoá Báo cáo quý 3 dùng được ngay' }))
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deleteLearningNode).toHaveBeenCalledWith('memory:profile:2')
    expect(screen.queryByText('Đã xoá — Hoàn tác')).toBeNull()
  })

  it('shows the two sections and six approved style choices', async () => {
    render(<MemoryView />)

    expect(await screen.findByRole('button', { name: /^Về tôi$/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Phong cách$/ }))

    expect(await screen.findByRole('button', { name: /^Jarvis$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Chuyên nghiệp$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Quản gia$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Bạn đồng hành$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Gia Cát Lượng$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Tưng Tửng$/ })).toBeTruthy()
  })

  it('writes a template for an empty profile without a warning and refetches it', async () => {
    render(<MemoryView />)

    fireEvent.click(await screen.findByRole('button', { name: /^Phong cách$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Jarvis$/ }))

    await waitFor(() => expect(updateProfileSoul).toHaveBeenCalledWith('default', jarvisSoul))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getProfileSoul).toHaveBeenCalledTimes(2)
  })

  it('requires confirmation before replacing a custom profile SOUL and does not write on cancel', async () => {
    getProfileSoul.mockResolvedValue({ content: '# My custom SOUL', exists: true })
    render(<MemoryView />)

    fireEvent.click(await screen.findByRole('button', { name: /^Phong cách$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Jarvis$/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/SOUL\.md hiện tại sẽ bị thay thế/i)
    expect(updateProfileSoul).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^Huỷ$/ }))
    expect(updateProfileSoul).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^Jarvis$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Xác nhận ghi đè$/ }))
    await waitFor(() => expect(updateProfileSoul).toHaveBeenCalledWith('default', jarvisSoul))
  })

  it('loads and writes SOUL for the newly active profile', async () => {
    const profileSouls = new Map([
      ['default', { content: '', exists: false }],
      ['profile-b', { content: '', exists: false }]
    ])
    getProfileSoul.mockImplementation(async (profile: string) => profileSouls.get(profile))

    render(<MemoryView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Phong cách$/ }))
    await waitFor(() => expect(getProfileSoul).toHaveBeenCalledWith('default'))

    activeProfileStore.set('profile-b')
    await waitFor(() => expect(getProfileSoul).toHaveBeenCalledWith('profile-b'))
    fireEvent.click(screen.getByRole('button', { name: /^Jarvis$/ }))

    await waitFor(() => expect(updateProfileSoul).toHaveBeenCalledWith('profile-b', jarvisSoul))
  })

  it('surfaces GET and PUT errors without claiming success', async () => {
    getProfileSoul.mockRejectedValueOnce(new Error('read failed'))
    render(<MemoryView />)

    fireEvent.click(await screen.findByRole('button', { name: /^Phong cách$/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Không tải được SOUL.md')

    cleanup()
    getProfileSoul.mockResolvedValue({ content: '', exists: false })
    updateProfileSoul.mockResolvedValueOnce({ ok: false })
    render(<MemoryView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Phong cách$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Jarvis$/ }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Không lưu được phong cách'))
    expect(screen.queryByText(/Đã áp dụng phong cách/i)).toBeNull()
  })
})
