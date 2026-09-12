import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { host } from '@/sdk'

import { launchProfileSourceConversation } from '../profile-interview/launcher'

export function ProfileInterviewCard() {
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const openConversation = async () => {
    setError(null)
    setOpening(true)

    try {
      await launchProfileSourceConversation({
        request: host.request,
        navigate: host.navigate,
        cwd: host.state.cwd.get()
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setOpening(false)
    }
  }

  return <div className="mb-6 rounded-xl border border-border bg-muted/20 p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Hồ sơ của tôi</h2><p className="mt-1 text-sm text-muted-foreground">Cập nhật bối cảnh để Siêu trợ lý hỗ trợ đúng hơn. Bạn luôn có thể dừng hoặc quay lại sau.</p>{opening && <p className="mt-2 text-sm text-muted-foreground">Đang mở cuộc trò chuyện…</p>}{error && <p className="mt-2 text-sm text-destructive" role="alert">Cần kết nối provider để bắt đầu: {error}</p>}</div><Button disabled={opening} onClick={() => void openConversation()}>{opening ? 'Đang mở…' : 'Bắt đầu trò chuyện'}</Button></div></div>
}
