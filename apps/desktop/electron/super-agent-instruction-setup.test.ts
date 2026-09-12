import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ensureSuperAgentInstructionSetup, superAgentInstructionPath } from './super-agent-instruction-setup'

const roots: string[] = []

const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-super-agent-instruction-'))
  roots.push(root)
  return root
}

afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { force: true, recursive: true })))

describe('Super Agent instruction setup', () => {
  it('copies the bundled instruction to the fixed Hermes home resource path', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-instruction.md')
    const contents = '# Super Agent — Instruction\n\napproved instruction\n'
    fs.writeFileSync(source, contents, 'utf8')

    const installed = ensureSuperAgentInstructionSetup({
      hermesHome: root,
      instructionSource: source
    })

    expect(installed).toBe(superAgentInstructionPath(root))
    expect(installed).toBe(path.join(root, 'resources', 'super-agent-instruction.md'))
    expect(fs.readFileSync(installed, 'utf8')).toBe(contents)
  })

  it('leaves an unchanged installed instruction untouched on a repeated setup', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-instruction.md')
    const contents = 'unchanged instruction\n'
    fs.writeFileSync(source, contents, 'utf8')

    const installed = ensureSuperAgentInstructionSetup({ hermesHome: root, instructionSource: source })
    const firstContents = fs.readFileSync(installed, 'utf8')

    ensureSuperAgentInstructionSetup({ hermesHome: root, instructionSource: source })

    expect(fs.readFileSync(installed, 'utf8')).toBe(firstContents)
  })

  it('refreshes an existing installed instruction when the bundled source changes', () => {
    const root = tempRoot()
    const source = path.join(root, 'bundled-instruction.md')
    const installed = superAgentInstructionPath(root)
    fs.writeFileSync(source, 'new instruction\n', 'utf8')
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.writeFileSync(installed, 'old instruction\n', 'utf8')

    ensureSuperAgentInstructionSetup({ hermesHome: root, instructionSource: source })

    expect(fs.readFileSync(installed, 'utf8')).toBe('new instruction\n')
  })

  it('rejects a missing bundled source before creating a destination file', () => {
    const root = tempRoot()

    expect(() =>
      ensureSuperAgentInstructionSetup({
        hermesHome: root,
        instructionSource: path.join(root, 'missing', 'super-agent-instruction.md')
      })
    ).toThrow('bundled instruction is missing')

    expect(fs.existsSync(superAgentInstructionPath(root))).toBe(false)
  })
})
