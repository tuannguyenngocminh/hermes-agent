import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { dailyReviewSkillPath, ensureDailyReviewSkillSetup } from './daily-review-skill-setup'

const roots: string[] = []
const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-daily-review-'))
  roots.push(root)
  return root
}

afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { force: true, recursive: true })))

describe('daily-review skill setup', () => {
  it('writes the bundled workflow under the fixed Hermes home path', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, '---\nname: sieu-tro-ly-ra-soat-hang-ngay\n---\n', 'utf8')

    const skillPath = ensureDailyReviewSkillSetup({ hermesHome: root, workflowSource: source })

    expect(skillPath).toBe(dailyReviewSkillPath(root))
    expect(skillPath).toContain(path.join('sieu-tro-ly-ra-soat-hang-ngay', 'SKILL.md'))
    expect(fs.readFileSync(skillPath, 'utf8')).toBe(fs.readFileSync(source, 'utf8'))
  })

  it('leaves an unchanged installed workflow untouched on a repeated setup', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    const contents = 'unchanged daily review workflow\n'
    fs.writeFileSync(source, contents, 'utf8')

    const skillPath = ensureDailyReviewSkillSetup({ hermesHome: root, workflowSource: source })
    const firstContents = fs.readFileSync(skillPath, 'utf8')

    ensureDailyReviewSkillSetup({ hermesHome: root, workflowSource: source })

    expect(fs.readFileSync(skillPath, 'utf8')).toBe(firstContents)
  })

  it('refreshes an existing installed workflow when the bundled source changes', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    fs.writeFileSync(source, 'new daily review workflow\n', 'utf8')
    const installed = dailyReviewSkillPath(root)
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.writeFileSync(installed, 'old daily review workflow\n', 'utf8')

    ensureDailyReviewSkillSetup({ hermesHome: root, workflowSource: source })

    expect(fs.readFileSync(installed, 'utf8')).toBe('new daily review workflow\n')
  })
})
