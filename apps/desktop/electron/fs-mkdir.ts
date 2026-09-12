import fs from 'node:fs'
import path from 'node:path'

import { resolveRequestedPathForIpc } from './hardening'

type FsMkdirOptions = { baseDir: string }
type FsMkdirResult = { ok: true; status: 'created' | 'skipped' }

function resolveWorkspacePath(requestedPath: string, baseDir: string): string {
  const resolvedBase = path.resolve(baseDir)

  const resolvedPath = resolveRequestedPathForIpc(requestedPath, {
    baseDir: resolvedBase,
    purpose: 'Create workspace directory'
  })

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error('Path is outside workspace root')
  }

  return resolvedPath
}

async function mkdirForIpc(requestedPath: string, options: FsMkdirOptions): Promise<FsMkdirResult> {
  const resolvedPath = resolveWorkspacePath(requestedPath, options.baseDir)

  try {
    const existing = await fs.promises.stat(resolvedPath)

    if (!existing.isDirectory()) {
      throw new Error('A file already exists at that path')
    }

    return { ok: true, status: 'skipped' }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  await fs.promises.mkdir(resolvedPath, { recursive: true })

  return { ok: true, status: 'created' }
}

export { mkdirForIpc, resolveWorkspacePath }
