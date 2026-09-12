import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { writeTextFileSafeForIpc } from './fs-write-safe'

describe('writeTextFileSafeForIpc', () => {
it('creates a missing file and never overwrites an existing file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fs-write-safe-'))

  try {
    fs.mkdirSync(path.join(root, 'Tài liệu'), { recursive: true })
    expect(await writeTextFileSafeForIpc('Tài liệu/AGENTS.md', 'new content', { baseDir: root })).toEqual({
      ok: true,
      status: 'created'
    })
    expect(await writeTextFileSafeForIpc('Tài liệu/AGENTS.md', 'replacement', { baseDir: root })).toEqual({
      ok: false,
      status: 'conflict'
    })
    expect(fs.readFileSync(path.join(root, 'Tài liệu', 'AGENTS.md'), 'utf8')).toBe('new content')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('rejects paths outside the workspace root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fs-write-safe-escape-'))

  try {
    await expect(writeTextFileSafeForIpc('../outside.txt', 'must not write', { baseDir: root })).rejects.toThrow('outside workspace root')
    expect(fs.existsSync(path.join(path.dirname(root), 'outside.txt'))).toBe(false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
})
