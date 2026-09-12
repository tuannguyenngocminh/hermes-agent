import { createCronJob, getCronJobs } from '@/hermes'
import type { CronJobCreatePayload } from '@/types/hermes'

export const DAILY_REVIEW_PROMPT = '/sieu-tro-ly-ra-soat-hang-ngay'

export const DAILY_REVIEW_CREATE_PAYLOAD: CronJobCreatePayload = {
  name: 'Rà soát hằng ngày',
  prompt: DAILY_REVIEW_PROMPT,
  schedule: '0 7 * * *',
  deliver: 'local'
}

const inFlightByProfile = new Map<string, Promise<void>>()

async function ensureForProfile(profile: string): Promise<void> {
  const jobs = await getCronJobs(profile)

  if (jobs.some(job => job.prompt === DAILY_REVIEW_PROMPT)) {
    return
  }

  await createCronJob({ ...DAILY_REVIEW_CREATE_PAYLOAD })
}

export function ensureDailyReviewJob(profile: string | null | undefined): Promise<void> {
  const profileKey = profile?.trim() ?? ''

  if (!profileKey) {
    return Promise.resolve()
  }

  const existing = inFlightByProfile.get(profileKey)

  if (existing) {
    return existing
  }

  let tracked: Promise<void>
  tracked = ensureForProfile(profileKey)
    .catch(() => undefined)
    .finally(() => {
      if (inFlightByProfile.get(profileKey) === tracked) {
        inFlightByProfile.delete(profileKey)
      }
    })

  inFlightByProfile.set(profileKey, tracked)

  return tracked
}
