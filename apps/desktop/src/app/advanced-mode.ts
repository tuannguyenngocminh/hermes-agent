import { computed } from 'nanostores'

import { Codecs, persistentAtom } from '@/lib/persisted'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'

const ADVANCED_MODE_STORAGE_KEY = 'hermes.desktop.advancedModeByProfile'

const $advancedModeByProfile = persistentAtom<Record<string, boolean>>(
  ADVANCED_MODE_STORAGE_KEY,
  {},
  Codecs.json(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
    )
  })
)

export const $advancedMode = computed([$advancedModeByProfile, $activeGatewayProfile], (modes, profile) =>
  modes[normalizeProfileKey(profile)] ?? false
)

export function setAdvancedMode(enabled: boolean): void {
  const profile = normalizeProfileKey($activeGatewayProfile.get())
  $advancedModeByProfile.set({ ...$advancedModeByProfile.get(), [profile]: enabled })
}

export function toggleAdvancedMode(): void {
  setAdvancedMode(!$advancedMode.get())
}
