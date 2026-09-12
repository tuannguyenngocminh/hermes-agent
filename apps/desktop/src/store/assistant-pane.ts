import { atom } from 'nanostores'

import { persistentAtom } from '@/lib/persisted'

export type AssistantPaneMode = 'docked' | 'floating'
export type AssistantTab = 'ask' | 'create' | 'review'

const MODE_KEY = 'hermes.desktop.assistantPane.mode'

const modeCodec = {
  decode: (raw: string): AssistantPaneMode => (raw === 'docked' ? 'docked' : 'floating'),
  encode: (value: AssistantPaneMode) => value
}

export const $assistantPaneMode = persistentAtom<AssistantPaneMode>(MODE_KEY, 'floating', modeCodec)
export const $assistantPaneTab = atom<AssistantTab>('review')

export function setAssistantPaneMode(mode: AssistantPaneMode): void {
  $assistantPaneMode.set(mode)
}

export function toggleAssistantPaneMode(): void {
  setAssistantPaneMode($assistantPaneMode.get() === 'floating' ? 'docked' : 'floating')
}
