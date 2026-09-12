import DOMAIN_CONTEXT_TEMPLATE from './domain-context-template.md?raw'

export type WorkspaceMode = 'new' | 'import-copy' | 'adopt-in-place'
export type OperationKind = 'create-directory' | 'create-file' | 'copy-file'

export type DomainDefinition = {
  id: string
  label: string
  folderName: string
  contextTemplate: string
  directories: string[]
}

export type WorkspaceOperation = {
  kind: OperationKind
  relativePath: string
  sourceRelativePath?: string
  content?: string
}

export type WorkspaceInventory = {
  files: Map<string, string>
  directories: Set<string>
}

export type WorkspacePlan = {
  root: string
  mode: WorkspaceMode
  domains: DomainDefinition[]
  operations: WorkspaceOperation[]
  conflicts: string[]
}

export type WorkspaceApplyResult = {
  created: string[]
  skipped: string[]
  conflicts: string[]
}

export type WorkspaceProjectReference = {
  folders?: Array<{ path?: null | string }>
  primary_path?: null | string
}

export const SEED_DOMAINS: DomainDefinition[] = [
  { id: 'documents', label: 'Tài liệu', folderName: 'Tài liệu', contextTemplate: DOMAIN_CONTEXT_TEMPLATE, directories: ['Đầu vào', 'Đang làm', 'Kết quả', 'Lưu trữ'] },
  { id: 'marketing', label: 'Marketing', folderName: 'Marketing', contextTemplate: DOMAIN_CONTEXT_TEMPLATE, directories: ['Đầu vào', 'Đang làm', 'Kết quả', 'Lưu trữ'] },
  { id: 'research', label: 'Nghiên cứu', folderName: 'Nghiên cứu', contextTemplate: DOMAIN_CONTEXT_TEMPLATE, directories: ['Đầu vào', 'Đang làm', 'Kết quả', 'Lưu trữ'] },
  { id: 'learning', label: 'Học tập', folderName: 'Học tập', contextTemplate: DOMAIN_CONTEXT_TEMPLATE, directories: ['Đầu vào', 'Đang làm', 'Kết quả', 'Lưu trữ'] },
  { id: 'training', label: 'Đào tạo', folderName: 'Đào tạo', contextTemplate: DOMAIN_CONTEXT_TEMPLATE, directories: ['Đầu vào', 'Đang làm', 'Kết quả', 'Lưu trữ'] }
]

export function workspaceDomainPath(root: string, domain: DomainDefinition): string {
  return `${root.replace(/[\\/]+$/, '')}/${domain.folderName}`
}

function normalizedWorkspacePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '')
}

export function domainsWithoutProjects(
  root: string,
  domains: DomainDefinition[],
  projects: WorkspaceProjectReference[]
): DomainDefinition[] {
  const registeredPaths = new Set<string>()

  for (const project of projects) {
    if (project.primary_path) {
      registeredPaths.add(normalizedWorkspacePath(project.primary_path))
    }

    for (const folder of project.folders ?? []) {
      if (folder.path) {
        registeredPaths.add(normalizedWorkspacePath(folder.path))
      }
    }
  }

  return domains.filter(domain => !registeredPaths.has(normalizedWorkspacePath(workspaceDomainPath(root, domain))))
}

function renderTemplate(template: string, domain: DomainDefinition): string {
  return template.replaceAll('{{Tên mảng}}', domain.label).replaceAll('{{mô tả ngắn loại việc}}', `các công việc thuộc mảng ${domain.label}`).replaceAll('{{danh sách skill/bundle liên quan}}', 'Các skill phù hợp được tham chiếu từ Super Agent.').replaceAll('{{tiêu chuẩn xử lý}}', 'Bám đúng thông tin và yêu cầu người dùng cung cấp.').replaceAll('{{output contract cụ thể}}', `Thành phẩm hoàn chỉnh của mảng ${domain.label}, sẵn dùng ngay.`).replaceAll('{{liệt kê hành động có tác động ra ngoài workspace}}', 'Gửi, đăng, chia sẻ hoặc thực hiện hành động bên ngoài workspace.').replaceAll('{{câu hỏi gợi ý 1}}', 'Nguồn đầu vào đã ở đâu hoặc đã gửi kèm chưa?').replaceAll('{{câu hỏi gợi ý 2}}', 'Kết quả cần dùng cho ai và theo tiêu chuẩn nào?')
}

function existingInventory(inventory?: WorkspaceInventory): WorkspaceInventory {
  return inventory ?? { files: new Map(), directories: new Set() }
}

export function buildWorkspacePlan(input: {
  root: string
  mode: WorkspaceMode
  domains: DomainDefinition[]
  inventory?: WorkspaceInventory
  sourceRoot?: string
}): WorkspacePlan {
  const inventory = existingInventory(input.inventory)
  const operations: WorkspaceOperation[] = []
  const conflicts: string[] = []

  for (const domain of input.domains) {
    const prefix = domain.folderName
    const agentsPath = `${prefix}/AGENTS.md`

    if (inventory.files.has(agentsPath)) {
      conflicts.push(agentsPath)
    } else {
      operations.push({ kind: 'create-file', relativePath: agentsPath, content: renderTemplate(domain.contextTemplate, domain) })
    }

    for (const directory of domain.directories) {
      const relativePath = `${prefix}/${directory}`

      if (inventory.files.has(relativePath)) {
        conflicts.push(relativePath)
      } else {
        operations.push({ kind: 'create-directory', relativePath })
      }
    }
  }

  return { root: input.root, mode: input.mode, domains: input.domains, operations, conflicts }
}

export function validateWorkspacePlan(plan: Pick<WorkspacePlan, 'root' | 'mode' | 'domains' | 'operations' | 'conflicts'>): { valid: true } | { valid: false; reason: string } {
  if (!plan.root.trim()) {
    return { valid: false, reason: 'Workspace root is required' }
  }

  if (!['new', 'import-copy', 'adopt-in-place'].includes(plan.mode)) {
    return { valid: false, reason: 'Workspace mode is invalid' }
  }

  for (const operation of plan.operations) {
    const relativePath = operation.relativePath.replaceAll('\\', '/')

    if (!relativePath || relativePath.startsWith('/') || /^[A-Za-z]:\//.test(relativePath) || relativePath.split('/').includes('..')) {
      return { valid: false, reason: `Operation path escapes workspace root: ${operation.relativePath}` }
    }

    if (operation.kind === 'copy-file' && !operation.sourceRelativePath) {
      return { valid: false, reason: `Copy source is missing: ${operation.relativePath}` }
    }
  }

  return { valid: true }
}
