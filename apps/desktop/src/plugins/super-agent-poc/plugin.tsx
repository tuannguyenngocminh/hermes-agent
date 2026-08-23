import { host, type HermesPlugin, PANES_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { useState } from 'react'

const PROOF_SKILL = 'hermes-agent-skill-authoring'
const PROOF_ARGUMENT = 'BP-11B plugin RPC proof'

type SkillDispatchResponse = {
  display?: string
  message?: string
  type?: string
}

type SuperAgentSkillMetadata = {
  displayName: string
  workArea: string
}

type SkillReadStatus = 'error' | 'idle' | 'loading' | 'success'

function parseYamlScalar(value: string) {
  const trimmed = value.trim()

  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function parseSuperAgentSkillMetadata(text: string): SuperAgentSkillMetadata {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)

  if (!frontmatter) {
    throw new Error('SKILL.md frontmatter is missing')
  }

  let metadataIndent: number | null = null
  let superAgentIndent: number | null = null
  let workArea = ''
  let displayName = ''

  for (const line of frontmatter[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue
    }

    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):(?:\s*(.*))?$/)

    if (!match) {
      continue
    }

    const indent = match[1].length
    const key = match[2]
    const value = match[3] ?? ''

    if (key === 'metadata' && !value.trim()) {
      metadataIndent = indent
      superAgentIndent = null
      continue
    }

    if (metadataIndent === null || indent <= metadataIndent) {
      continue
    }

    if (key === 'super_agent' && !value.trim()) {
      superAgentIndent = indent
      continue
    }

    if (superAgentIndent === null || indent <= superAgentIndent) {
      continue
    }

    if (key === 'work_area') {
      workArea = parseYamlScalar(value)
    }

    if (key === 'display_name') {
      displayName = parseYamlScalar(value)
    }
  }

  if (!workArea || !displayName) {
    throw new Error('metadata.super_agent.work_area and display_name are required')
  }

  return { displayName, workArea }
}

function ProofOfConceptPage() {
  return <main aria-label="Super Agent Desktop Plugin proof of concept" />
}

function FloatingPaneProofOfConcept() {
  const [status, setStatus] = useState<'error' | 'idle' | 'loading' | 'success'>('idle')
  const [detail, setDetail] = useState('')
  const [skillReadStatus, setSkillReadStatus] = useState<SkillReadStatus>('idle')
  const [skillReadDetail, setSkillReadDetail] = useState('')
  const [skillMetadata, setSkillMetadata] = useState<SuperAgentSkillMetadata | null>(null)

  const loadSkillIntoSession = async () => {
    if (status === 'loading') {
      return
    }

    setStatus('loading')
    setDetail('Creating session…')

    let createdSessionId: string | null = null

    try {
      console.info('[BP-11B] rpc.start method=session.create')
      const created = await host.request<{ session_id: string; stored_session_id?: string }>('session.create', {
        cols: 96,
        source: 'desktop',
        ...(host.state.cwd.get() ? { cwd: host.state.cwd.get() } : {})
      })
      createdSessionId = created.session_id
      const routeSessionId = created.stored_session_id ?? created.session_id
      console.info('[BP-11B] rpc.done method=session.create', {
        runtime_session_id: created.session_id,
        stored_session_id: created.stored_session_id ?? null
      })
      setDetail('Loading skill…')

      console.info('[BP-11B] rpc.start method=command.dispatch', {
        runtime_session_id: createdSessionId,
        name: PROOF_SKILL
      })
      const dispatch = await host.request<SkillDispatchResponse>('command.dispatch', {
        session_id: createdSessionId,
        name: PROOF_SKILL,
        arg: PROOF_ARGUMENT
      })
      console.info('[BP-11B] rpc.done method=command.dispatch', {
        runtime_session_id: createdSessionId,
        type: dispatch.type ?? null,
        has_message: Boolean(dispatch.message?.trim()),
        has_display: Boolean(dispatch.display?.trim())
      })

      const text = dispatch.message?.trim()

      if (!text) {
        throw new Error('command.dispatch returned no skill message')
      }

      setDetail('Submitting skill prompt…')
      console.info('[BP-11B] rpc.start method=prompt.submit', { runtime_session_id: createdSessionId })
      await host.request('prompt.submit', { session_id: createdSessionId, text })
      console.info('[BP-11B] rpc.done method=prompt.submit', { runtime_session_id: createdSessionId })

      host.navigate(`/${encodeURIComponent(routeSessionId)}`)
      setDetail(`Session ${routeSessionId.slice(0, 12)} opened`)
      setStatus('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (createdSessionId) {
        try {
          await host.request('session.close', { session_id: createdSessionId })
          console.info('[BP-11B] cleanup.done method=session.close', { runtime_session_id: createdSessionId })
        } catch (cleanupError) {
          console.error('[BP-11B] cleanup.error method=session.close', cleanupError)
        }
      }

      console.error('[BP-11B] rpc.error', { runtime_session_id: createdSessionId, message })
      setDetail(message)
      setStatus('error')
    }
  }

  const readSkillMetadata = async () => {
    if (skillReadStatus === 'loading') {
      return
    }

    setSkillReadStatus('loading')
    setSkillReadDetail('Đang đọc SKILL.md qua Electron bridge…')
    setSkillMetadata(null)

    try {
      const desktopPluginsRoot = window.hermesDesktop.desktopPluginsRoot

      if (!desktopPluginsRoot) {
        throw new Error('Electron bridge does not expose desktopPluginsRoot')
      }

      const pluginsRoot = await desktopPluginsRoot()

      if (!pluginsRoot) {
        throw new Error('Electron bridge returned no desktop plugins root')
      }

      const profileRoot = pluginsRoot.replace(/[\\/]+desktop-plugins[\\/]*$/, '')
      const skillPath = `${profileRoot}\\super-agent-workflows\\bp-11c-sample\\SKILL.md`
      console.info('[BP-11C] bridge.start method=readFileText', { plugins_root: pluginsRoot, skill_path: skillPath })
      const result = await window.hermesDesktop.readFileText(skillPath)
      console.info('[BP-11C] bridge.done method=readFileText', {
        plugins_root: pluginsRoot,
        skill_path: skillPath,
        byte_size: result.byteSize,
      })

      const parsed = parseSuperAgentSkillMetadata(result.text)
      setSkillMetadata(parsed)
      setSkillReadDetail('Đã đọc và parse metadata.super_agent')
      setSkillReadStatus('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      console.error('[BP-11C] bridge.error method=readFileText', { message })
      setSkillReadDetail(message)
      setSkillReadStatus('error')
    }
  }

  return (
    <section aria-label="Super Agent floating pane proof of concept" className="flex h-full flex-col gap-2 p-4">
      <strong>Super Agent Floating PoC</strong>
      <span>Floating pane is active.</span>
      <button
        className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        disabled={status === 'loading'}
        onClick={() => void loadSkillIntoSession()}
        type="button"
      >
        {status === 'loading' ? 'Đang nạp skill…' : 'Nạp skill vào session'}
      </button>
      {detail && (
        <span className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'} role="status">
          {detail}
        </span>
      )}
      <hr className="my-1 border-border" />
      <strong>BP-11C: Skill metadata</strong>
      <span>Đọc trực tiếp từ SKILL.md qua Electron bridge.</span>
      <button
        className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        disabled={skillReadStatus === 'loading'}
        onClick={() => void readSkillMetadata()}
        type="button"
      >
        {skillReadStatus === 'loading' ? 'Đang đọc SKILL.md…' : 'Đọc SKILL.md mẫu'}
      </button>
      {skillReadDetail && (
        <span className={skillReadStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'} role="status">
          {skillReadDetail}
        </span>
      )}
      {skillMetadata && (
        <article aria-label="BP-11C skill metadata card" className="rounded border border-border bg-muted/30 p-3">
          <strong className="block">Skill: {skillMetadata.displayName}</strong>
          <span className="block text-xs text-muted-foreground">Mảng công việc: {skillMetadata.workArea}</span>
          <span className="block text-xs text-muted-foreground">Nguồn: SKILL.md qua Electron bridge</span>
        </article>
      )}
    </section>
  )
}

const plugin: HermesPlugin = {
  id: 'super-agent-poc',
  name: 'Super Agent Desktop Plugin PoC',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        title: 'Desktop Plugin PoC',
        data: { path: '/super-agent-poc' },
        render: () => <ProofOfConceptPage />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: {
          codicon: 'extensions',
          label: 'Desktop Plugin PoC',
          path: '/super-agent-poc'
        }
      },
      {
        id: 'floating-pane',
        area: PANES_AREA,
        title: 'Super Agent Floating PoC',
        data: {
          placement: 'floating',
          anchor: 'top-right',
          width: '320px',
          height: '180px'
        },
        render: () => <FloatingPaneProofOfConcept />
      }
    ])
  }
}

export default plugin
