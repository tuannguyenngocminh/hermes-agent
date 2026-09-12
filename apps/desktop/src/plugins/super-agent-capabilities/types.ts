import type { SkillInfo } from '@/types/hermes'

export type CapabilityLayer = 'connection' | 'platform' | 'work'
export type CapabilitySourceId = 'hermes' | 'hub' | 'mine' | 'sa'
export type CapabilityReadinessStatus = 'available' | 'setup_needed' | 'unsupported'

export type CapabilitySkill = SkillInfo & {
  readiness_status?: CapabilityReadinessStatus
}

export interface CapabilityData {
  readinessStatusAvailable: boolean
  skills: CapabilitySkill[]
  superAgentNames: string[]
}

export interface CapabilitySource {
  description: string
  id: CapabilitySourceId
  label: string
  token: string
}

export interface CapabilityViewModel {
  layer: CapabilityLayer
  skill: CapabilitySkill
  source: CapabilitySource
  title: string
  area: string
}
