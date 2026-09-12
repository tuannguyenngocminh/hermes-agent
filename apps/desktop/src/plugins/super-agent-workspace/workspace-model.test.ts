import { describe, expect, it } from 'vitest'

import {
  buildWorkspacePlan,
  domainsWithoutProjects,
  SEED_DOMAINS,
  validateWorkspacePlan,
  workspaceDomainPath,
  type WorkspaceInventory
} from './workspace-model'

describe('workspace plan model', () => {
  it('builds the four-directory convention only for selected domains', () => {
    const plan = buildWorkspacePlan({
      root: 'C:/fixture',
      mode: 'new',
      domains: [SEED_DOMAINS.find(domain => domain.id === 'marketing')!]
    })

    expect(plan.operations.map(operation => operation.relativePath)).toEqual([
      'Marketing/AGENTS.md',
      'Marketing/Đầu vào',
      'Marketing/Đang làm',
      'Marketing/Kết quả',
      'Marketing/Lưu trữ'
    ])
    expect(plan.operations.some(operation => operation.relativePath.startsWith('Tài liệu/'))).toBe(false)
  })

  it('never emits move, delete, or overwrite operations for import and adopt modes', () => {
    for (const mode of ['import-copy', 'adopt-in-place'] as const) {
      const plan = buildWorkspacePlan({
        root: 'C:/fixture',
        mode,
        domains: [SEED_DOMAINS[0]],
        sourceRoot: 'C:/existing'
      })

      expect(plan.operations.every(operation => ['create-directory', 'create-file', 'copy-file'].includes(operation.kind))).toBe(
        true
      )
    }
  })

  it('reports a same-name file as a conflict without changing its sentinel content', () => {
    const inventory: WorkspaceInventory = {
      files: new Map([['Tài liệu/AGENTS.md', '# user-owned sentinel']]),
      directories: new Set()
    }

    const plan = buildWorkspacePlan({ root: 'C:/fixture', mode: 'new', domains: [SEED_DOMAINS[0]], inventory })

    expect(plan.conflicts).toEqual(['Tài liệu/AGENTS.md'])
    expect(plan.operations.find(operation => operation.relativePath === 'Tài liệu/AGENTS.md')).toBeUndefined()
    expect(inventory.files.get('Tài liệu/AGENTS.md')).toBe('# user-owned sentinel')
  })

  it('rejects paths that are absolute or escape the approved root', () => {
    expect(validateWorkspacePlan({ root: 'C:/fixture', mode: 'new', domains: [], operations: [{ kind: 'create-directory', relativePath: '../outside' }], conflicts: [] })).toEqual(
      expect.objectContaining({ valid: false })
    )
    expect(validateWorkspacePlan({ root: 'C:/fixture', mode: 'new', domains: [], operations: [{ kind: 'create-directory', relativePath: 'C:/outside' }], conflicts: [] })).toEqual(
      expect.objectContaining({ valid: false })
    )
  })

  it('registers a domain only once when the same apply logic runs twice', () => {
    const domain = SEED_DOMAINS.find(item => item.id === 'marketing')!
    const root = 'C:/fixture'
    let projects: { primary_path: string }[] = []
    const first = domainsWithoutProjects(root, [domain], projects)

    projects = first.map(item => ({ primary_path: workspaceDomainPath(root, item) }))
    const second = domainsWithoutProjects(root, [domain], projects)

    expect(first).toEqual([domain])
    expect(second).toEqual([])
  })
})
