const DEFAULT_FALLBACK_MS = 5000

type WindowLike = {
  isDestroyed: () => boolean
  isVisible: () => boolean
  once: (event: 'ready-to-show', listener: () => void) => void
}

type ShowWindowWhenReadyOptions = {
  fallbackMs?: number
  label: string
  log: (message: string) => void
  show: () => void
}

/**
 * Prefer Electron's themed first paint, but keep a visible recovery path when
 * an environment never emits `ready-to-show` for an initially hidden window.
 */
export function showWindowWhenReadyOrAfterTimeout(
  window: WindowLike,
  { fallbackMs = DEFAULT_FALLBACK_MS, label, log, show }: ShowWindowWhenReadyOptions
) {
  let readyToShow = false

  const reveal = () => {
    if (!window.isDestroyed() && !window.isVisible()) {
      show()
    }
  }

  const fallback = setTimeout(() => {
    if (readyToShow || window.isDestroyed() || window.isVisible()) {
      return
    }

    log(`[window] ${label} did not emit ready-to-show within ${fallbackMs}ms; showing fallback`)
    reveal()
  }, fallbackMs)

  if (typeof fallback.unref === 'function') {
    fallback.unref()
  }

  window.once('ready-to-show', () => {
    readyToShow = true
    clearTimeout(fallback)
    reveal()
  })
}
