import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('./launcher', () => ({ launchProfileSourceConversation: launch }))

import { ProfileInterviewCard } from '../settings/profile-interview-card'

afterEach(() => {
  cleanup()
})

describe('in-app profile interview', () => {
  it('opens the LLM-led conversation instead of rendering a three-question form', async () => {
    launch.mockReturnValueOnce(new Promise(() => undefined))
    render(<ProfileInterviewCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu trò chuyện' }))

    expect(launch).toHaveBeenCalledOnce()
    expect(await screen.findByText('Đang mở cuộc trò chuyện…')).toBeTruthy()
    expect(screen.queryByText(/Câu 1 \/ 3/)).toBeNull()
  })
})
