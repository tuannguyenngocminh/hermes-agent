export const KILO_FALLBACK_EXHAUSTED_FAILURE_REASON = 'kilo_fallback_exhausted'

export const KILO_FALLBACK_EXHAUSTED_COPY = {
  title: 'Lượt dùng thử miễn phí hôm nay đã hết.',
  body: 'Đăng nhập ChatGPT — không giới hạn lượt, phù hợp việc quan trọng. Hoặc lấy key Google Gemini miễn phí rồi dán vào Cài đặt.',
  chatGptAction: 'Đăng nhập ChatGPT (khuyên dùng)',
  geminiAction: 'Lấy key Google Gemini miễn phí',
  chatGptReason: 'Đăng nhập ChatGPT — không giới hạn lượt, phù hợp việc quan trọng.',
  geminiReason: 'Lấy key Google Gemini miễn phí, sau đó vào Cài đặt để dán key.'
} as const

export function kiloFallbackCopyForFailureReason(reason: unknown) {
  return reason === KILO_FALLBACK_EXHAUSTED_FAILURE_REASON ? KILO_FALLBACK_EXHAUSTED_COPY : null
}
