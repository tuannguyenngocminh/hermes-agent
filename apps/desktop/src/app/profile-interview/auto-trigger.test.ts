// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { claimProfileSourceAutoTrigger, PROFILE_SOURCE_AUTO_TRIGGER_KEY } from './auto-trigger'

describe('profile-source auto-trigger claim', () => {
  let storage: Storage

  beforeEach(() => {
    const values = new Map<string, string>()
    storage = {
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      key: (index) => [...values.keys()][index] ?? null,
      get length() {
        return values.size
      },
      removeItem: (key) => values.delete(key)
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  })

  afterEach(() => {
    storage.clear()
  })

  it('returns true once and stores the marker', () => {
    expect(claimProfileSourceAutoTrigger()).toBe(true)
    expect(window.localStorage.getItem(PROFILE_SOURCE_AUTO_TRIGGER_KEY)).toBe('1')
  })

  it('returns false after the marker has already been claimed', () => {
    expect(claimProfileSourceAutoTrigger()).toBe(true)

    expect(claimProfileSourceAutoTrigger()).toBe(false)
  })

  it('fails closed when storage access throws', () => {
    const originalStorage = storage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('storage unavailable')
        },
        setItem: () => {
          throw new Error('storage unavailable')
        }
      }
    })

    expect(() => claimProfileSourceAutoTrigger()).not.toThrow()
    expect(claimProfileSourceAutoTrigger()).toBe(false)

    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalStorage })
    expect(originalStorage.getItem(PROFILE_SOURCE_AUTO_TRIGGER_KEY)).toBeNull()
  })
})
