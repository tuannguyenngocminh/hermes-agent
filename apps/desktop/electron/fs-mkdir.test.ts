import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { mkdirForIpc } from './fs-mkdir'

describe('mkdirForIpc', () => {
it('creates an idempotent child directory and rejects escape paths', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fs-mkdir-'))

  try {
    expect(await mkdirForIpc('Tài liệu/Đầu vào', { baseDir: root })).toEqual({ ok: true, status: 'created' })
    expect(await mkdirForIpc('Tài liệu/Đầu vào', { baseDir: root })).toEqual({ ok: true, status: 'skipped' })
    await expect(mkdirForIpc('../outside', { baseDir: root })).rejects.toThrow('outside workspace root')
    expect(fs.existsSync(path.join(root, 'Tài liệu', 'Đầu vào'))).toBe(true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('reports a file collision without replacing the file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fs-mkdir-conflict-'))

  try {
    const target = path.join(root, 'Tài liệu')
    fs.writeFileSync(target, 'sentinel', 'utf8')
    await expect(mkdirForIpc('Tài liệu', { baseDir: root })).rejects.toThrow('file already exists')
    expect(fs.readFileSync(target, 'utf8')).toBe('sentinel')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
})
