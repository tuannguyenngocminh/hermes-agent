import './assistant-pane.css'

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

// eslint-disable-next-line no-restricted-imports -- bundled plugin consumes the generic render context type.
import type { ContributionRenderContext } from '@/contrib/types'
import { getCronJobs, triggerCronJob, updateCronJob } from '@/hermes'
// eslint-disable-next-line no-restricted-imports -- bundled plugin shares the host-owned persisted pane state.
import { $assistantPaneTab, toggleAssistantPaneMode } from '@/store/assistant-pane'
import { notifyError, notify } from '@/store/notifications'
import { $activeGatewayProfile } from '@/store/profile'
import type { CronJob } from '@/types/hermes'

type AssistantTab = 'review' | 'ask' | 'create'

const TABS: { id: AssistantTab; label: string }[] = [
  { id: 'review', label: 'Tự Nâng Cấp' },
  { id: 'ask', label: 'Hỏi đáp' },
  { id: 'create', label: 'Tạo việc mới' }
]

const REVIEW_SECTIONS = [
  'Thành quả đã đạt được',
  'Mách bạn',
  'Năng lực nên mở khoá thêm',
  'Công nghệ hữu ích cho bạn',
  'Quy trình của chuyên gia'
]

const B1_PROMPT = '/sieu-tro-ly-ra-soat-hang-ngay'

type ReviewCadence = 'daily' | 'every-3-days' | 'weekly'

const CADENCE_OPTIONS: { id: ReviewCadence; label: string; schedule: string }[] = [
  { id: 'daily', label: 'Hằng ngày', schedule: '0 7 * * *' },
  { id: 'every-3-days', label: '3 ngày', schedule: '0 7 */3 * *' },
  { id: 'weekly', label: 'Hằng tuần', schedule: '0 7 * * 1' }
]

function cadenceFromSchedule(expr?: string): ReviewCadence | null {
  return CADENCE_OPTIONS.find(option => option.schedule === expr)?.id ?? null
}

function findB1Job(jobs: CronJob[]): CronJob | null {
  const matches = jobs.filter(job => job.prompt === B1_PROMPT)
  return matches.length === 1 ? matches[0] : null
}

function scheduleForCadence(cadence: ReviewCadence) {
  return CADENCE_OPTIONS.find(option => option.id === cadence)?.schedule ?? ''
}

function ReviewPanel() {
  const activeProfile = useStore($activeGatewayProfile)
  const [reviewJob, setReviewJob] = useState<CronJob | null>(null)
  const [cadence, setCadence] = useState<ReviewCadence | null>(null)
  const [busy, setBusy] = useState<'cadence' | 'trigger' | null>(null)

  useEffect(() => {
    let cancelled = false

    void getCronJobs(activeProfile)
      .then(jobs => {
        if (cancelled) return

        const job = findB1Job(jobs)
        setReviewJob(job)
        setCadence(job ? cadenceFromSchedule(job.schedule?.expr) : null)
      })
      .catch(error => {
        if (!cancelled) {
          notifyError(error, 'Không thể tải lịch Tự Nâng Cấp')
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeProfile])

  async function handleCadenceChange(nextCadence: ReviewCadence) {
    if (cadence === nextCadence) return

    if (!reviewJob) {
      notifyError(new Error('Lịch Tự Nâng Cấp chưa sẵn sàng. Vui lòng mở lại ứng dụng rồi thử lại.'), 'Không thể đổi nhịp độ Tự Nâng Cấp')
      return
    }

    setBusy('cadence')
    try {
      const updatedJob = await updateCronJob(reviewJob.id, { schedule: scheduleForCadence(nextCadence) })
      setReviewJob(updatedJob)
      setCadence(cadenceFromSchedule(updatedJob.schedule?.expr))
    } catch (error) {
      notifyError(error, 'Không thể đổi nhịp độ Tự Nâng Cấp')
    } finally {
      setBusy(null)
    }
  }

  async function handleTrigger() {
    if (!reviewJob) {
      notifyError(new Error('Lịch Tự Nâng Cấp chưa sẵn sàng. Vui lòng mở lại ứng dụng rồi thử lại.'), 'Không thể chạy Tự Nâng Cấp ngay')
      return
    }

    setBusy('trigger')
    try {
      await triggerCronJob(reviewJob.id)
      notify({ kind: 'success', title: 'Tự Nâng Cấp', message: 'Đã bắt đầu rà soát ngay.' })
    } catch (error) {
      notifyError(error, 'Không thể chạy Tự Nâng Cấp ngay')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sa-assistant-review">
      <div className="sa-assistant-intro">
        <h2>Tự Nâng Cấp</h2>
        <p>
          Tính năng giúp bạn vượt trội hơn 90% người dùng AI hiện tại, mỗi ngày sử dụng công cụ thành thạo hơn, tiết kiệm được nhiều thời gian hơn. Siêu trợ lý sẽ đề xuất cho bạn cách sử dụng các công nghệ tiên tiến nhất, quy trình làm việc tối ưu nhất để hoàn thành các công việc của bạn hiệu quả hơn, đơn giản hơn, tối ưu hơn và vượt xa đối thủ.
        </p>
      </div>
      <fieldset className="sa-assistant-cadence" disabled={busy !== null}>
        <legend>Chọn nhịp độ đề xuất:</legend>
        <div className="sa-assistant-cadence-options">
          {CADENCE_OPTIONS.map(option => (
            <label key={option.id}>
              <input
                checked={cadence === option.id}
                name="assistant-review-cadence"
                onChange={() => void handleCadenceChange(option.id)}
                type="radio"
                value={option.id}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="sa-assistant-upgrade-button" disabled={busy !== null} onClick={() => void handleTrigger()} type="button">
        {busy === 'trigger' ? 'Đang nâng cấp…' : 'Tự nâng cấp ngay'}
      </button>
      <p className="sa-assistant-empty">Chưa có bản rà soát mới.</p>
      {REVIEW_SECTIONS.map(section => (
        <section className="sa-assistant-review-row" key={section}>
          <h3>{section}</h3>
          <p>Thông tin sẽ xuất hiện khi Siêu trợ lý có dữ liệu rà soát.</p>
        </section>
      ))}
    </div>
  )
}

function AskPanel() {
  return (
    <div className="sa-assistant-placeholder">
      <p>Hỏi Siêu trợ lý bất cứ lúc nào về cách dùng hoặc cách làm việc hiệu quả hơn.</p>
      <span>B2 sẽ được nối vào skill Hỏi đáp ở task nội dung tương ứng.</span>
    </div>
  )
}

function CreatePanel() {
  return (
    <div className="sa-assistant-placeholder">
      <p>Kể tôi nghe một việc bạn đang phải làm tay lặp đi lặp lại.</p>
      <span>Tạo việc mới chưa sẵn sàng cho tới khi skill-builder-interview được triển khai.</span>
    </div>
  )
}

function tabPanel(tab: AssistantTab) {
  if (tab === 'review') {
    return <ReviewPanel />
  }

  if (tab === 'ask') {
    return <AskPanel />
  }

  return <CreatePanel />
}

function AssistantOrb() {
  return (
    <span aria-hidden="true" className="sa-assistant-orb">
      <svg fill="none" viewBox="0 0 24 24">
        <path
          d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
        <path d="M20 2v4M22 4h-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
        <circle cx="4" cy="20" r="2" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </span>
  )
}

export function AssistantPane({ renderContext }: { renderContext?: ContributionRenderContext } = {}) {
  const activeTab = useStore($assistantPaneTab)
  const floating = renderContext?.floating
  const docked = renderContext?.docked
  const customHeader = floating !== undefined || docked !== undefined
  const collapsed = floating?.collapsed ?? false

  return (
    <section
      aria-label="Siêu trợ lý"
      className={customHeader ? 'sa-assistant-pane sa-assistant-custom-surface' : 'sa-assistant-pane'}
    >
      {customHeader ? (
        floating?.collapsed ? (
          <button
            aria-label="Mở Siêu trợ lý"
            className="sa-assistant-collapsed-orb"
            {...floating.dragHandleProps}
            onClick={floating.onToggleCollapse}
            type="button"
          >
            <AssistantOrb />
          </button>
        ) : (
          <header className="sa-assistant-custom-header" {...floating?.dragHandleProps}>
            <div className="sa-assistant-custom-identity">
              <AssistantOrb />
              <span>Siêu trợ lý</span>
            </div>
            <div className="sa-assistant-custom-actions">
              {floating && (
                <button aria-label="Thu gọn" data-floating-no-drag onClick={floating.onToggleCollapse} type="button">
                  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                    <path
                      d="m7 10 5 5 5-5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              )}
              <button
                aria-label="Đổi vị trí Siêu trợ lý"
                data-floating-no-drag
                onClick={toggleAssistantPaneMode}
                type="button"
              >
                ⇄
              </button>
              <button
                aria-label="Đóng"
                data-floating-no-drag
                onClick={docked ? docked.onClose : floating?.onToggleCollapse}
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
          </header>
        )
      ) : (
        <div aria-hidden="true" className="sa-assistant-heading">
          <AssistantOrb />
        </div>
      )}

      {!collapsed && (
        <>
          <div aria-label="Các chức năng Siêu trợ lý" className="sa-assistant-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                aria-controls={`sa-assistant-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'sa-assistant-tab is-active' : 'sa-assistant-tab'}
                id={`sa-assistant-tab-${tab.id}`}
                key={tab.id}
                onClick={() => $assistantPaneTab.set(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`sa-assistant-tab-${activeTab}`}
            className="sa-assistant-content"
            id={`sa-assistant-panel-${activeTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {tabPanel(activeTab)}
          </div>

          <form className="sa-assistant-footer">
            <input aria-label="Hỏi Siêu trợ lý" disabled placeholder="Hỏi Siêu trợ lý…" type="text" />
            <button aria-label="Gửi" disabled type="button">
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="m4 4 16 8-16 8 3-8-3-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M7 12h13" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            </button>
          </form>
        </>
      )}
    </section>
  )
}
