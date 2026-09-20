import { describe, expect, it } from 'vitest'

import {
  KILO_FALLBACK_EXHAUSTED_FAILURE_REASON,
  kiloFallbackCopyForFailureReason
} from './kilo-fallback'

describe('Kilo fallback exhaustion copy', () => {
  it('returns the single Vietnamese surface copy for the structured signal', () => {
    const copy = kiloFallbackCopyForFailureReason(KILO_FALLBACK_EXHAUSTED_FAILURE_REASON)

    expect(copy).toMatchObject({
      title: 'Lượt dùng thử miễn phí hôm nay đã hết.',
      chatGptAction: 'Đăng nhập ChatGPT (khuyên dùng)',
      geminiAction: 'Lấy key Google Gemini miễn phí'
    })
    expect(JSON.stringify(copy)).not.toMatch(/kilo|model|http|json|error|lỗi/i)
  })

  it('does not classify unrelated provider failures as Kilo exhaustion', () => {
    expect(kiloFallbackCopyForFailureReason('billing')).toBeNull()
    expect(kiloFallbackCopyForFailureReason(undefined)).toBeNull()
  })
})
