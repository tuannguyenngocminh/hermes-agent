import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CronJob } from '@/types/hermes'

const { createCronJob, getCronJobs } = vi.hoisted(() => ({
  createCronJob: vi.fn(),
  getCronJobs: vi.fn()
}))

vi.mock('@/hermes', () => ({
  createCronJob,
  getCronJobs
}))

import { ensureDailyReviewJob } from './ensure-daily-review-job'

const PROMPT = '/sieu-tro-ly-ra-soat-hang-ngay'
const CREATE_PAYLOAD = {
  name: 'Rà soát hằng ngày',
  prompt: PROMPT,
  schedule: '0 7 * * *',
  deliver: 'local'
}

function job(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    enabled: true,
    prompt: PROMPT,
    name: 'Rà soát hằng ngày',
    schedule: { kind: 'cron', expr: '0 7 * * *' },
    deliver: 'local',
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

describe('ensureDailyReviewJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call the API for a blank profile', async () => {
    await ensureDailyReviewJob('  ')

    expect(getCronJobs).not.toHaveBeenCalled()
    expect(createCronJob).not.toHaveBeenCalled()
  })

  it('creates one BP-25 job for a fresh profile', async () => {
    getCronJobs.mockResolvedValue([])
    createCronJob.mockResolvedValue(job())

    await ensureDailyReviewJob('bp86-fresh')

    expect(getCronJobs).toHaveBeenCalledOnce()
    expect(getCronJobs).toHaveBeenCalledWith('bp86-fresh')
    expect(createCronJob).toHaveBeenCalledOnce()
    expect(createCronJob).toHaveBeenCalledWith(CREATE_PAYLOAD)
  })

  it('leaves an existing matching job unchanged on the next startup', async () => {
    const existing = job({ id: 'existing-job' })
    getCronJobs.mockResolvedValue([existing])

    await ensureDailyReviewJob('bp86-fresh')

    expect(existing).toEqual(job({ id: 'existing-job' }))
    expect(createCronJob).not.toHaveBeenCalled()
  })

  it('preserves a user-changed schedule', async () => {
    const existing = job({ schedule: { kind: 'cron', expr: '0 7 * * 1' } })
    getCronJobs.mockResolvedValue([existing])

    await ensureDailyReviewJob('bp86-fresh')

    expect(existing.schedule?.expr).toBe('0 7 * * 1')
    expect(createCronJob).not.toHaveBeenCalled()
  })

  it('preserves a paused matching job', async () => {
    const existing = job({ enabled: false })
    getCronJobs.mockResolvedValue([existing])

    await ensureDailyReviewJob('bp86-fresh')

    expect(existing.enabled).toBe(false)
    expect(createCronJob).not.toHaveBeenCalled()
  })

  it('keeps duplicate matching jobs without creating another', async () => {
    const existing = [job({ id: 'job-1' }), job({ id: 'job-2' })]
    getCronJobs.mockResolvedValue(existing)

    await ensureDailyReviewJob('bp86-fresh')

    expect(createCronJob).not.toHaveBeenCalled()
    expect(existing.map(item => item.id)).toEqual(['job-1', 'job-2'])
  })

  it('swallows a slow backend failure without retrying', async () => {
    vi.useFakeTimers()
    getCronJobs.mockImplementation(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('offline')), 100)))

    const request = ensureDailyReviewJob('bp86-fresh')
    await vi.advanceTimersByTimeAsync(100)
    await request
    await vi.advanceTimersByTimeAsync(60_000)

    expect(getCronJobs).toHaveBeenCalledOnce()
    expect(createCronJob).not.toHaveBeenCalled()
  })

  it('shares one in-flight check and create between concurrent calls', async () => {
    const pending = deferred<CronJob[]>()
    getCronJobs.mockReturnValue(pending.promise)
    createCronJob.mockResolvedValue(job())

    const first = ensureDailyReviewJob('bp86-fresh')
    const second = ensureDailyReviewJob('bp86-fresh')

    expect(getCronJobs).toHaveBeenCalledOnce()
    pending.resolve([])
    await Promise.all([first, second])

    expect(createCronJob).toHaveBeenCalledOnce()
    expect(createCronJob).toHaveBeenCalledWith(CREATE_PAYLOAD)
  })
})
