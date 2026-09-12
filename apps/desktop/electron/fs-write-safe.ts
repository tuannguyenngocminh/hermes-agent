import fs from 'node:fs'
import path from 'node:path'

import { resolveWorkspacePath } from './fs-mkdir'

type FsWriteSafeOptions = { baseDir: string; overwrite?: false }
type FsWriteSafeResult = { ok: true; status: 'created' } | { ok: false; status: 'conflict' }

async function writeTextFileSafeForIpc(
  requestedPath: string,
  content: string,
  options: FsWriteSafeOptions
): Promise<FsWriteSafeResult> {
  const resolvedPath = resolveWorkspacePath(requestedPath, options.baseDir)
  const text = String(content ?? '')

  if (text.length > 1_000_000) {
    throw new Error('Content too large')
  }

  if (!fs.existsSync(path.dirname(resolvedPath))) {
    throw new Error('Parent directory does not exist')
  }

  try {
    await fs.promises.writeFile(resolvedPath, text, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'EISDIR') {
      return { ok: false, status: 'conflict' }
    }

    throw error
  }

  return { ok: true, status: 'created' }
}

export { writeTextFileSafeForIpc }
