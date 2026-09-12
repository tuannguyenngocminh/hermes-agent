import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ensureSuperAgentWorkflowSetup, superAgentWorkflowSkillPath } from './super-agent-workflow-setup'

const roots: string[] = []

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-super-agent-workflow-'))
  roots.push(root)
  return root
}

afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { force: true, recursive: true })))

describe('Super Agent workflow setup', () => {
  it.each(['tro-ly-chia-viec', 'tro-ly-noi-viec'])('copies %s to the fixed Hermes home skill path', workflowName => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    const contents = `---\nname: ${workflowName}\n---\nworkflow\n`
    fs.writeFileSync(source, contents, 'utf8')

    const installed = ensureSuperAgentWorkflowSetup({
      hermesHome: root,
      workflowName,
      workflowSource: source
    })

    expect(installed).toBe(superAgentWorkflowSkillPath(root, workflowName))
    expect(installed).toBe(path.join(root, 'skills', 'super-agent', workflowName, 'SKILL.md'))
    expect(fs.readFileSync(installed, 'utf8')).toBe(contents)
  })

  it('rejects a missing bundled source before creating a destination file', () => {
    const root = tempRoot()

    expect(() =>
      ensureSuperAgentWorkflowSetup({
        hermesHome: root,
        workflowName: 'tro-ly-chia-viec',
        workflowSource: path.join(root, 'missing', 'SKILL.md')
      })
    ).toThrow('bundled workflow is missing')

    expect(fs.existsSync(superAgentWorkflowSkillPath(root, 'tro-ly-chia-viec'))).toBe(false)
  })

  it('leaves an unchanged installed workflow unchanged on a repeated setup', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    const contents = 'unchanged workflow\n'
    fs.writeFileSync(source, contents, 'utf8')

    const installed = ensureSuperAgentWorkflowSetup({
      hermesHome: root,
      workflowName: 'tro-ly-noi-viec',
      workflowSource: source
    })
    const firstContents = fs.readFileSync(installed, 'utf8')

    ensureSuperAgentWorkflowSetup({
      hermesHome: root,
      workflowName: 'tro-ly-noi-viec',
      workflowSource: source
    })

    expect(fs.readFileSync(installed, 'utf8')).toBe(firstContents)
  })

  it('refreshes an existing installed workflow when the bundled source changes', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-skill.md')
    const installed = superAgentWorkflowSkillPath(root, 'tro-ly-chia-viec')
    fs.writeFileSync(source, 'new workflow\n', 'utf8')
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.writeFileSync(installed, 'old workflow\n', 'utf8')

    ensureSuperAgentWorkflowSetup({
      hermesHome: root,
      workflowName: 'tro-ly-chia-viec',
      workflowSource: source
    })

    expect(fs.readFileSync(installed, 'utf8')).toBe('new workflow\n')
  })
})
