import { host } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

/* eslint-disable no-restricted-imports -- approved BP-33: this bundled page uses the existing desktop filesystem and project seams; it does not expose them to runtime plugins. */
import { mkdirDesktopPath, readDesktopDir, readDesktopFileText, selectDesktopPaths, writeDesktopFileTextSafe } from '@/lib/desktop-fs'
import { $projects, createProject } from '@/store/projects'

import { DASHBOARD_PILLS } from '../super-agent-dashboard/dashboard'

import {
  buildWorkspacePlan,
  domainsWithoutProjects,
  SEED_DOMAINS,
  validateWorkspacePlan,
  workspaceDomainPath,
  type WorkspaceMode
} from './workspace-model'

async function inspectWorkspace(root: string, paths: string[], files: Map<string, string>, directories: Set<string>) {
  for (const relativePath of paths) {
    try {
      const listing = await readDesktopDir(`${root}/${relativePath}`)
      directories.add(relativePath)

      for (const entry of listing.entries) {
        const child = `${relativePath}/${entry.name}`

        if (entry.isDirectory) {
          directories.add(child)
        } else {
          try {
            const file = await readDesktopFileText(entry.path)
            files.set(child, file.text)
          } catch {
            files.set(child, '')
          }
        }
      }
    } catch {
      // Missing paths are expected during the first preview.
    }
  }
}

export function WorkspaceView() {
  const [root, setRoot] = useState('')
  const [sourceRoot, setSourceRoot] = useState('')
  const [mode, setMode] = useState<WorkspaceMode>('new')
  const [selected, setSelected] = useState(() => new Set(SEED_DOMAINS.map(domain => domain.id)))
  const [preview, setPreview] = useState<ReturnType<typeof buildWorkspacePlan> | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const domains = useMemo(() => SEED_DOMAINS.filter(domain => selected.has(domain.id)), [selected])

  const chooseRoot = async () => {
    const [chosen] = await selectDesktopPaths({ directories: true, multiple: false, title: 'Chọn thư mục workspace' })

    if (chosen) {
      setRoot(chosen)
      setPreview(null)
    }
  }

  const chooseSource = async () => {
    const [chosen] = await selectDesktopPaths({ directories: true, multiple: false, title: 'Chọn thư mục cần nhập' })

    if (chosen) {
      setSourceRoot(chosen)
      setPreview(null)
    }
  }

  const makePreview = async () => {
    if (!root) {
      setStatus('Hãy chọn thư mục workspace trước.')

      return
    }

    if (!domains.length) {
      setStatus('Hãy chọn ít nhất một mảng.')

      return
    }

    if (mode === 'import-copy' && !sourceRoot) {
      setStatus('Hãy chọn thư mục nguồn để nhập và sao chép.')

      return
    }

    const files = new Map<string, string>()
    const directories = new Set<string>()
    await inspectWorkspace(root, domains.flatMap(domain => [domain.folderName, ...domain.directories.map(dir => `${domain.folderName}/${dir}`)]), files, directories)
    const next = buildWorkspacePlan({ root, mode, domains, sourceRoot, inventory: { files, directories } })
    setPreview(next)
    setStatus(next.conflicts.length ? `Có ${next.conflicts.length} mục trùng tên; các mục này sẽ được giữ nguyên.` : 'Đã sẵn sàng để xem trước.')
  }

  const apply = async () => {
    if (!preview) {return setStatus('Hãy bấm Xem trước trước.')}
    const validation = validateWorkspacePlan(preview)

    if (!validation.valid) {return setStatus(validation.reason)}
    setBusy(true)
    const created: string[] = []
    const skipped: string[] = []
    const conflicts = [...preview.conflicts]

    try {
      for (const operation of preview.operations.filter(item => item.kind === 'create-directory')) {
        const result = await mkdirDesktopPath(operation.relativePath, preview.root)

        ;(result.status === 'created' ? created : skipped).push(operation.relativePath)
      }

      for (const operation of preview.operations.filter(item => item.kind === 'create-file')) {
        const result = await writeDesktopFileTextSafe(operation.relativePath, operation.content || '', preview.root)

        ;(result.status === 'created' ? created : conflicts).push(operation.relativePath)
      }

      const projectsToCreate = domainsWithoutProjects(preview.root, preview.domains, $projects.get())

      for (const domain of projectsToCreate) {
        const domainPath = workspaceDomainPath(preview.root, domain)

        await createProject({
          name: domain.label,
          folders: [domainPath],
          primaryPath: domainPath,
          use: false
        })
      }

      host.navigate('/kho')
      setStatus(
        `Đã hoàn tất: tạo mới ${created.length} mục; giữ nguyên ${skipped.length} mục đã có${
          conflicts.length ? `; ${conflicts.length} file đã có sẵn nên không thay đổi` : ''
        }.`
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main aria-label="Thư mục làm việc" className="h-full overflow-auto bg-background px-6 py-7 text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-muted-foreground">Siêu trợ lý</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Thư mục làm việc</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Tạo workspace có cấu trúc rõ ràng mà không di chuyển hoặc ghi đè file sẵn có.</p>
        </header>
        <section aria-label="Thiết lập workspace" className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap gap-3">
            {(['new', 'import-copy', 'adopt-in-place'] as WorkspaceMode[]).map(item => (
              <label className="rounded-lg border px-3 py-2 text-sm" key={item}>
                <input checked={mode === item} className="mr-2" name="workspace-mode" onChange={() => { setMode(item); setPreview(null) }} type="radio" />
                {item === 'new' ? 'Workspace mới' : item === 'import-copy' ? 'Nhập và sao chép' : 'Dùng tại chỗ'}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => void chooseRoot()} type="button">Chọn thư mục đích</button>
            {mode === 'import-copy' && <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void chooseSource()} type="button">Chọn thư mục nguồn</button>}
          </div>
          <p className="mt-3 break-all text-sm text-muted-foreground">Đích: {root || 'chưa chọn'}{mode === 'import-copy' && ` · Nguồn: ${sourceRoot || 'chưa chọn'}`}</p>
        </section>
        <section aria-label="Chọn mảng" className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Các mảng muốn tạo</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DASHBOARD_PILLS.filter(pill => pill.id !== 'all').map(pill => (
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm" key={pill.id}>
                <input checked={selected.has(pill.id)} onChange={() => { setSelected(previous => { const next = new Set(previous); next.has(pill.id) ? next.delete(pill.id) : next.add(pill.id);

 return next }); setPreview(null) }} type="checkbox" />
                {pill.label}
              </label>
            ))}
          </div>
        </section>
        <section aria-label="Xem trước và duyệt" className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap gap-3">
            <button className="rounded-md border px-3 py-2 text-sm" onClick={() => void makePreview()} type="button">Xem trước</button>
            <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !preview} onClick={() => void apply()} type="button">DUYỆT và tạo</button>
          </div>
          {preview && <div className="mt-4 text-sm"><p className="font-medium">{preview.operations.length} mục sẽ được tạo</p><ul className="mt-2 list-disc pl-5">{preview.operations.map(operation => <li key={operation.relativePath}>{operation.relativePath}</li>)}</ul>{preview.conflicts.length > 0 && <p className="mt-3 text-amber-700">Giữ nguyên: {preview.conflicts.join(', ')}</p>}</div>}
          {status && <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">{status}</p>}
        </section>
      </div>
    </main>
  )
}
