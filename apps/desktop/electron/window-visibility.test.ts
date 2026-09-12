import assert from 'node:assert/strict'

import { afterEach, test, vi } from 'vitest'

import { showWindowWhenReadyOrAfterTimeout } from './window-visibility'

afterEach(() => {
  vi.useRealTimers()
})

test('shows a hidden window through the fallback and logs when ready-to-show never arrives', () => {
  vi.useFakeTimers()

  let readyToShow: (() => void) | undefined
  let showCalls = 0
  const log = vi.fn()

  showWindowWhenReadyOrAfterTimeout(
    {
      isDestroyed: () => false,
      isVisible: () => false,
      once: (_event, listener) => {
        readyToShow = listener
      }
    },
    {
      fallbackMs: 5000,
      label: 'Primary window',
      log,
      show: () => {
        showCalls += 1
      }
    }
  )

  assert.ok(readyToShow)
  vi.advanceTimersByTime(4999)
  assert.equal(showCalls, 0)

  vi.advanceTimersByTime(1)
  assert.equal(showCalls, 1)
  assert.deepEqual(log.mock.calls, [['[window] Primary window did not emit ready-to-show within 5000ms; showing fallback']])
})

test('uses ready-to-show as the normal path and cancels the fallback', () => {
  vi.useFakeTimers()

  let readyToShow: (() => void) | undefined
  let showCalls = 0
  const log = vi.fn()

  showWindowWhenReadyOrAfterTimeout(
    {
      isDestroyed: () => false,
      isVisible: () => false,
      once: (_event, listener) => {
        readyToShow = listener
      }
    },
    {
      fallbackMs: 5000,
      label: 'Primary window',
      log,
      show: () => {
        showCalls += 1
      }
    }
  )

  readyToShow?.()
  vi.advanceTimersByTime(5000)

  assert.equal(showCalls, 1)
  assert.equal(log.mock.calls.length, 0)
})
