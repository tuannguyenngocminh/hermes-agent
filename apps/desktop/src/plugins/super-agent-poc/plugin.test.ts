import * as fs from 'node:fs'
import * as path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseSuperAgentSkillMetadata } from './plugin'

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..', '..')
const fixturePath = path.join(workspaceRoot, '_evidence', 'bp-11c-v2', 'sample-skill', 'SKILL.md')

function skill(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Fixture\n`
}

describe('parseSuperAgentSkillMetadata', () => {
  it('reads unquoted metadata.super_agent scalar fields', () => {
    expect(parseSuperAgentSkillMetadata(skill(`metadata:\n  super_agent:\n    work_area: Nội dung marketing\n    display_name: Viết bài Facebook`))).toEqual({
      workArea: 'Nội dung marketing',
      displayName: 'Viết bài Facebook',
    })
  })

  it('removes matching single and double quotes around scalar fields', () => {
    expect(parseSuperAgentSkillMetadata(skill(`metadata:\n  super_agent:\n    work_area: 'Nội dung marketing'\n    display_name: "Viết bài Facebook"`))).toEqual({
      workArea: 'Nội dung marketing',
      displayName: 'Viết bài Facebook',
    })
  })

  it('rejects missing metadata.super_agent fields', () => {
    expect(() => parseSuperAgentSkillMetadata(skill('metadata:\n  title: Not a skill'))).toThrow(
      'metadata.super_agent.work_area and display_name are required',
    )
    expect(() => parseSuperAgentSkillMetadata(skill('metadata:\n  super_agent:\n    work_area: Nội dung marketing'))).toThrow(
      'metadata.super_agent.work_area and display_name are required',
    )
  })

  it('does not read identically named fields outside metadata.super_agent', () => {
    expect(() => parseSuperAgentSkillMetadata(skill(`work_area: Sai phạm vi\ndisplay_name: Sai phạm vi\nmetadata:\n  super_agent:\n    work_area: Nội dung marketing`))).toThrow(
      'metadata.super_agent.work_area and display_name are required',
    )
  })

  it('parses the immutable BP-11C SKILL.md fixture', () => {
    const result = parseSuperAgentSkillMetadata(fs.readFileSync(fixturePath, 'utf8'))

    expect(result).toEqual({ workArea: 'Nội dung marketing', displayName: 'Viết bài Facebook' })
  })
})
