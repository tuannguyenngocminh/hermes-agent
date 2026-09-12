/* eslint-disable no-restricted-imports -- approved: reads getStarmapGraph() (BP-29) and readDesktopDir (BP-27) via existing Hermes/desktop-fs bridges, same precedent as super-agent-memory (BP-26B). */

import { getSkills, getStarmapGraph, setSkillEnabled } from '@/hermes'
import { readDesktopDir } from '@/lib/desktop-fs'
import { host } from '@hermes/plugin-sdk'

import type { CapabilityData, CapabilitySkill } from './types'

export async function loadSuperAgentNames(): Promise<string[]> {
  const desktop = window.hermesDesktop
  const desktopPluginsRoot = desktop?.desktopPluginsRoot
  if (!desktopPluginsRoot) return []

  const pluginsRoot = await desktopPluginsRoot()
  if (!pluginsRoot) return []

  const profileRoot = pluginsRoot.replace(/[\\/]+desktop-plugins[\\/]*$/, '')
  try {
    const result = await readDesktopDir(`${profileRoot}\\super-agent-workflows`)
    return result.entries.filter(entry => entry.isDirectory).map(entry => entry.name).sort()
  } catch {
    // A profile may legitimately have no bundled workflow directory yet. The
    // page remains usable, but source classification stays conservative.
    return []
  }
}

export async function loadCapabilities(): Promise<CapabilityData> {
  const [rawSkills, superAgentNames] = await Promise.all([getSkills(), loadSuperAgentNames()])

  // The current `/api/skills` contract does not expose skill_view readiness.
  // Keep the optional field pass-through-only; do not infer setup state from
  // category, description, or provenance.
  const skills = mergeNativeConnections(rawSkills as CapabilitySkill[])
  return { readinessStatusAvailable: skills.some(skill => skill.readiness_status), skills, superAgentNames }
}

const NATIVE_CONNECTIONS: CapabilitySkill[] = [
  { category: 'research', description: '', enabled: true, name: 'web_search', provenance: 'bundled', readiness_status: 'setup_needed' },
  { category: 'creative', description: '', enabled: true, name: 'image_generate', provenance: 'bundled', readiness_status: 'setup_needed' },
  { category: 'training', description: '', enabled: true, name: 'text_to_speech', provenance: 'bundled', readiness_status: 'setup_needed' }
]

export function mergeNativeConnections(skills: CapabilitySkill[]): CapabilitySkill[] {
  const existing = new Set(skills.map(skill => skill.name))
  return [...skills, ...NATIVE_CONNECTIONS.filter(skill => !existing.has(skill.name))]
}

export async function loadWorkMemoryLabels(): Promise<string[]> {
  try {
    const graph = await getStarmapGraph()
    return graph.nodes
      .filter(node => {
        if (node.kind !== 'memory' || !node.label.trim()) return false
        const text = node.label.toLocaleLowerCase('vi')
        return !/(đã|kết quả|báo cáo|bài đăng|phải sửa|dùng được)/u.test(text) &&
          !/(viết|đặt tên|giờ làm|phong cách|quy tắc|làm việc)/u.test(text)
      })
      .map(node => node.label.trim())
  } catch {
    return []
  }
}

export async function toggleCapability(name: string, enabled: boolean): Promise<void> {
  await setSkillEnabled(name, enabled)
}

export async function launchCapability(name: string): Promise<string> {
  const created = await host.request<{ session_id: string; stored_session_id?: string }>('session.create', {
    cols: 96,
    source: 'desktop',
    ...(host.state.cwd.get() ? { cwd: host.state.cwd.get() } : {})
  })
  const dispatch = await host.request<{ message?: string }>('command.dispatch', {
    session_id: created.session_id,
    name,
    arg: ''
  })
  const text = dispatch.message?.trim()
  if (!text) throw new Error('command.dispatch returned no skill message')

  await host.request('prompt.submit', { session_id: created.session_id, text })
  const routeSessionId = created.stored_session_id ?? created.session_id
  host.navigate(`/${encodeURIComponent(routeSessionId)}`)
  return routeSessionId
}
