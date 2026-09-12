import { host } from '@hermes/plugin-sdk'
import { getUsageAnalytics, listSessions } from '@/hermes'
import type { SessionInfo } from '@/types/hermes'
import { useEffect, useMemo, useState } from 'react'

type DashboardPill = { id: string; label: string }

type WorkCard = {
  id: string
  area: string
  title: string
  description: string
  prompt: string
}

function sessionTimestamp(session: SessionInfo): number {
  return session.last_active || session.started_at
}

function isToday(session: SessionInfo, now: Date): boolean {
  const date = new Date(sessionTimestamp(session) * 1000)
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function sessionTitle(session: SessionInfo): string {
  return session.title || session.preview || 'Phiên làm việc'
}

function sessionStatus(session: SessionInfo): string {
  if (session.is_active) {
    return 'Đang chạy'
  }

  return session.ended_at ? 'Đã hoàn tất' : 'Đã bắt đầu'
}

function sessionTime(session: SessionInfo): string {
  return new Date(sessionTimestamp(session) * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const DASHBOARD_PILLS: DashboardPill[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'documents', label: 'Tài liệu' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'research', label: 'Nghiên cứu' },
  { id: 'learning', label: 'Học tập' },
  { id: 'training', label: 'Đào tạo' }
]

export const WORK_CARDS: WorkCard[] = [
  {
    id: 'summarize-document',
    area: 'documents',
    title: 'Tóm tắt tài liệu',
    description: 'Rút gọn nội dung dài thành các ý chính dễ dùng.',
    prompt: 'Hãy giúp tôi tóm tắt tài liệu tôi cung cấp thành các ý chính và việc cần làm.'
  },
  {
    id: 'marketing-copy',
    area: 'marketing',
    title: 'Viết bài quảng cáo',
    description: 'Tạo bản nháp nội dung marketing theo mục tiêu của bạn.',
    prompt: 'Hãy giúp tôi viết một bản nháp nội dung marketing phù hợp với mục tiêu tôi cung cấp.'
  },
  {
    id: 'research-brief',
    area: 'research',
    title: 'Nghiên cứu nhanh',
    description: 'Lập bản tóm tắt nghiên cứu có cấu trúc và nguồn cần kiểm tra.',
    prompt: 'Hãy giúp tôi lập một bản tóm tắt nghiên cứu có cấu trúc từ câu hỏi tôi cung cấp.'
  },
  {
    id: 'learn-topic',
    area: 'learning',
    title: 'Học một chủ đề',
    description: 'Giải thích một chủ đề theo mức độ hiểu hiện tại của bạn.',
    prompt: 'Hãy giúp tôi học một chủ đề mới bằng cách giải thích từng bước và kiểm tra mức độ hiểu.'
  },
  {
    id: 'training-plan',
    area: 'training',
    title: 'Lập kế hoạch đào tạo',
    description: 'Chuyển mục tiêu học tập thành lộ trình có thể theo dõi.',
    prompt: 'Hãy giúp tôi lập một kế hoạch đào tạo thực tế theo mục tiêu và thời gian tôi cung cấp.'
  }
]

async function startWork(card: WorkCard, setStatus: (status: string) => void) {
  setStatus(`Đang mở phiên cho ${card.title}…`)
  let sessionId: string | null = null

  try {
    const created = await host.request<{ session_id: string; stored_session_id?: string }>('session.create', {
      cols: 96,
      source: 'desktop',
      ...(host.state.cwd.get() ? { cwd: host.state.cwd.get() } : {})
    })
    sessionId = created.session_id
    const routeSessionId = created.stored_session_id ?? created.session_id
    await host.request('prompt.submit', { session_id: sessionId, text: card.prompt })
    host.navigate(`/${encodeURIComponent(routeSessionId)}`)
    setStatus(`Đã mở phiên cho ${card.title}`)
  } catch (error) {
    if (sessionId) {
      try {
        await host.request('session.close', { session_id: sessionId })
      } catch {
        // Preserve the original error for the user-facing status.
      }
    }
    setStatus(error instanceof Error ? error.message : String(error))
  }
}

export function DashboardView() {
  const [activePill, setActivePill] = useState('all')
  const [status, setStatus] = useState('')
  const [todayCost, setTodayCost] = useState<number | null>(null)
  const [costLoading, setCostLoading] = useState(true)
  const [costError, setCostError] = useState(false)
  const [todaySessions, setTodaySessions] = useState<SessionInfo[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState(false)
  const cards = useMemo(
    () => (activePill === 'all' ? WORK_CARDS : WORK_CARDS.filter(card => card.area === activePill)),
    [activePill]
  )

  useEffect(() => {
    let mounted = true

    void getUsageAnalytics(1)
      .then(response => {
        if (!mounted) {
          return
        }

        const today = new Date().toISOString().slice(0, 10)
        const cost = response.daily.find(entry => entry.day === today)?.estimated_cost
        setTodayCost(typeof cost === 'number' && Number.isFinite(cost) ? cost : null)
        setCostError(false)
      })
      .catch(() => {
        if (mounted) {
          setTodayCost(null)
          setCostError(true)
        }
      })
      .finally(() => {
        if (mounted) {
          setCostLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    void listSessions(50, 1, 'exclude', 'recent')
      .then(response => {
        if (!mounted) {
          return
        }

        const now = new Date()
        const sessions = response.sessions
          .filter(session => isToday(session, now))
          .sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left))
        setTodaySessions(sessions)
        setActivityError(false)
      })
      .catch(() => {
        if (mounted) {
          setTodaySessions([])
          setActivityError(true)
        }
      })
      .finally(() => {
        if (mounted) {
          setActivityLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const todayCostValue = costLoading
    ? 'Đang tải…'
    : costError
      ? 'Không tải được chi phí hôm nay'
      : todayCost === null
        ? 'Chưa có dữ liệu'
        : `$${todayCost.toFixed(2)}`

  return (
    <main
      aria-label="Super Agent work dashboard"
      className="h-full overflow-auto bg-background px-6 py-7 text-foreground"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header>
          <p className="text-sm font-medium text-muted-foreground">Siêu trợ lý</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard công việc</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Chọn một việc để bắt đầu, hoặc xem lại tiến độ gần đây của bạn.
          </p>
        </header>

        <section
          aria-label="Tổng quan"
          className="grid grid-cols-1 divide-y rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {[
            ['Mảng đang chạy', '--'],
            ['Việc đã chạy tuần này', '--'],
            ['Chi phí ước tính hôm nay', todayCostValue]
          ].map(([label, value]) => (
            <div className="px-5 py-4" key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <nav aria-label="Lọc công việc" className="flex gap-2 overflow-x-auto pb-1">
          {DASHBOARD_PILLS.map(pill => (
            <button
              aria-pressed={activePill === pill.id}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${activePill === pill.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}
              key={pill.id}
              onClick={() => setActivePill(pill.id)}
              type="button"
            >
              {pill.label}
            </button>
          ))}
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
          <section aria-labelledby="work-cards-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold" id="work-cards-heading">
                Việc bạn hay làm
              </h2>
              <span className="text-xs text-muted-foreground">{cards.length} lựa chọn</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {cards.map(card => (
                <article className="flex min-h-40 flex-col justify-between rounded-xl border bg-card p-5" key={card.id}>
                  <div>
                    <h3 className="font-medium">{card.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                  </div>
                  <button
                    aria-label={`Bắt đầu ${card.title}`}
                    className="mt-5 w-fit rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                    onClick={() => void startWork(card, setStatus)}
                    type="button"
                  >
                    Bắt đầu
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="activity-heading" className="rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold" id="activity-heading">
              Hôm nay đã làm gì
            </h2>
            {activityLoading ? (
              <div className="mt-6 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Đang tải hoạt động…</div>
            ) : activityError ? (
              <div className="mt-6 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Không tải được hoạt động hôm nay
              </div>
            ) : todaySessions.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Chưa có hoạt động hôm nay.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {todaySessions.map(session => (
                  <article className="rounded-lg border p-3" key={session.id}>
                    <p className="font-medium">{sessionTitle(session)}</p>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{sessionTime(session)}</span>
                      <span>{sessionStatus(session)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section aria-labelledby="recent-heading" className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold" id="recent-heading">
            Kết quả gần đây
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">Các kết quả hoàn thành sẽ được hiển thị tại đây.</p>
        </section>

        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {status}
        </p>
      </div>
    </main>
  )
}
