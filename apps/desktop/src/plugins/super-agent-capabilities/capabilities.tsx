import './capabilities.css'

import { host, type HermesPlugin, type RouteContribution, ROUTES_AREA, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'

import { launchCapability, loadCapabilities, loadWorkMemoryLabels, toggleCapability } from './api'
import type {
  CapabilityLayer,
  CapabilitySkill,
  CapabilitySource,
  CapabilitySourceId,
  CapabilityViewModel
} from './types'

export type { CapabilitySkill } from './types'

export const CAPABILITIES_PATH = '/nang-luc'

type CapabilityPill = { id: string; label: string }

export const CAPABILITY_PILLS: CapabilityPill[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'documents', label: 'Tài liệu' },
  { id: 'marketing', label: 'Nội dung marketing' },
  { id: 'research', label: 'Nghiên cứu' },
  { id: 'learning', label: 'Học tập' },
  { id: 'training', label: 'Đào tạo' }
]

export const CAPABILITY_SOURCES: CapabilitySource[] = [
  { id: 'hermes', label: 'Hermes gốc', description: 'Thứ Hermes tự biết làm', token: 'src-hermes' },
  { id: 'sa', label: 'Super Agent', description: 'Đi kèm sẵn khi mua', token: 'src-sa' },
  { id: 'hub', label: 'Từ kho Hermes', description: 'Tải thêm từ ngoài', token: 'src-hub' },
  { id: 'mine', label: 'Của bạn', description: 'Siêu trợ lý tạo, hoặc bạn tự viết', token: 'src-mine' }
]

const sourceById = (id: CapabilitySourceId) => CAPABILITY_SOURCES.find(source => source.id === id) ?? CAPABILITY_SOURCES[3]

function titleForSkill(name: string): string {
  const knownTitles: Record<string, string> = {
    image_generate: 'Tạo ảnh minh hoạ',
    'marketing-copy': 'Viết bài marketing',
    'research-brief': 'Nghiên cứu nhanh',
    'summarize-document': 'Tóm tắt tài liệu',
    text_to_speech: 'Tạo giọng nói',
    web_search: 'Đọc web'
  }
  if (knownTitles[name]) return knownTitles[name]

  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function areaForSkill(skill: CapabilitySkill): string {
  const text = `${skill.category} ${skill.name} ${skill.description}`.toLowerCase()
  if (text.includes('market') || text.includes('marketing')) return 'marketing'
  if (text.includes('research') || text.includes('nghiên cứu')) return 'research'
  if (text.includes('learn') || text.includes('học')) return 'learning'
  if (text.includes('train') || text.includes('đào tạo')) return 'training'
  if (text.includes('document') || text.includes('file') || text.includes('pdf') || text.includes('word')) return 'documents'
  return 'all'
}

function areaLabel(area: string): string {
  return (
    {
      documents: 'Tài liệu',
      learning: 'Học tập',
      marketing: 'Nội dung marketing',
      research: 'Nghiên cứu',
      training: 'Đào tạo'
    }[area] ?? 'Dùng chung'
  )
}

function layerForSkill(skill: CapabilitySkill): CapabilityLayer {
  if (skill.readiness_status === 'setup_needed') return 'connection'
  return skill.provenance === 'bundled' ? 'platform' : 'work'
}

export function classifySkill(skill: CapabilitySkill, superAgentNames: string[] = []): CapabilityViewModel {
  let sourceId: CapabilitySourceId = skill.provenance === 'bundled' ? 'hermes' : skill.provenance === 'hub' ? 'hub' : 'mine'
  if (skill.provenance === 'agent' && superAgentNames.includes(skill.name)) sourceId = 'sa'

  return {
    area: areaForSkill(skill),
    layer: layerForSkill(skill),
    skill,
    source: sourceById(sourceId),
    title: titleForSkill(skill.name)
  }
}

export function toCapabilityViewModels(skills: CapabilitySkill[], superAgentNames: string[] = []): CapabilityViewModel[] {
  return skills.map(skill => classifySkill(skill, superAgentNames))
}

const CONTEXTUAL_CONTENT: Record<string, { benefit: string; benefitWithWork: string; description: string; how: string }> = {
  image_generate: {
    benefit: 'Hữu ích khi bạn cần hình ảnh nhanh cho bài đăng, sản phẩm, hoặc tài liệu mà chưa có sẵn.',
    benefitWithWork: 'Hữu ích khi bạn cần hình ảnh nhanh cho {label}.',
    description: 'Tạo ảnh từ mô tả bằng lời, hoặc chỉnh sửa ảnh có sẵn theo yêu cầu — không cần thuê designer.',
    how: 'Chọn 1 nhà cung cấp tạo ảnh trong Cài đặt (có lựa chọn miễn phí) — dùng lại tài khoản đã đăng nhập nếu nhà cung cấp đó hỗ trợ tạo ảnh.'
  },
  text_to_speech: {
    benefit: 'Hữu ích khi bạn cần biến nội dung văn bản thành audio mà không cần tự thu âm.',
    benefitWithWork: 'Hữu ích khi bạn cần biến nội dung thành audio cho {label}.',
    description: 'Chuyển văn bản thành file âm thanh — đọc bài giảng, lồng tiếng, đọc thông báo, chỉnh được tốc độ đọc.',
    how: 'Có sẵn 1 giọng miễn phí dùng ngay, không cần đăng ký — muốn giọng tự nhiên hơn thì chọn thêm nhà cung cấp trả phí.'
  },
  web_search: {
    benefit: 'Hữu ích khi bạn cần tổng hợp thông tin từ nhiều trang mà không muốn tự đọc từng cái.',
    benefitWithWork: 'Hữu ích khi bạn cần tra thông tin cho {label} mà không muốn tự đọc từng trang.',
    description: 'Tìm kiếm và đọc nội dung từ web — tra thông tin, tìm bài viết, trích nội dung từ 1 trang cụ thể (kể cả file PDF) mà không cần tự mở từng trang.',
    how: 'Chọn 1 nhà cung cấp tìm kiếm/đọc web trong Cài đặt (có gói miễn phí), nhập mã.'
  }
}

function contextualBenefit(item: CapabilityViewModel, workMemoryLabels: string[]): string {
  const content = CONTEXTUAL_CONTENT[item.skill.name]
  if (!content) return 'Giúp bạn bắt đầu nhanh hơn mà vẫn xem lại kết quả trước khi dùng.'
  if (workMemoryLabels.length === 0) return content.benefit
  return content.benefitWithWork.replace('{label}', workMemoryLabels.join(', '))
}

function CapabilityCard({ item, workMemoryLabels }: { item: CapabilityViewModel; workMemoryLabels: string[] }) {
  const [status, setStatus] = useState('')
  const [enabled, setEnabled] = useState(item.skill.enabled)
  const [busy, setBusy] = useState(false)
  const content = CONTEXTUAL_CONTENT[item.skill.name]
  const description = content?.description ?? (item.skill.description || 'Năng lực sẵn sàng để bạn khám phá.')
  const how = content?.how ?? 'Dùng bằng cách nói tên việc và thêm bối cảnh bạn muốn xử lý.'

  return (
    <article className="sa-capability-card" data-source={item.source.id}>
      <div className="sa-capability-card__source" title={item.source.description} />
      <div className="sa-capability-card__body">
        <div className="sa-capability-card__header">
          <div className="sa-capability-card__heading">
            <h3>{item.title}</h3>
            <span className="sa-capability-card__area">{areaLabel(item.area)}</span>
          </div>
        </div>
        <p className="sa-capability-card__what">{description}</p>
        <p className="sa-capability-card__how">{how}</p>
        <p className="sa-capability-card__benefit">{contextualBenefit(item, workMemoryLabels)}</p>
        <button
          aria-label={`Bắt đầu ${item.title}`}
          className="sa-button sa-button--secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void launchCapability(item.skill.name)
              .then(sessionId => setStatus(`Đã gửi năng lực vào phiên ${sessionId.slice(0, 12)}`))
              .catch(error => setStatus(error instanceof Error ? error.message : String(error)))
              .finally(() => setBusy(false))
          }}
          type="button"
        >
          Bắt đầu
        </button>
        <button
          aria-label={`${enabled ? 'Tắt' : 'Bật'} ${item.title}`}
          className="sa-button sa-button--tertiary"
          disabled={busy}
          onClick={() => {
            const next = !enabled
            setBusy(true)
            void toggleCapability(item.skill.name, next)
              .then(() => {
                setEnabled(next)
                setStatus(next ? 'Đã bật năng lực.' : 'Đã tắt năng lực.')
              })
              .catch(error => setStatus(error instanceof Error ? error.message : String(error)))
              .finally(() => setBusy(false))
          }}
          type="button"
        >
          {enabled ? 'Tắt' : 'Bật'}
        </button>
        {status && <p className="sa-capability-card__status" role="status">{status}</p>}
      </div>
    </article>
  )
}

function ConnectionCard({ item, workMemoryLabels }: { item: CapabilityViewModel; workMemoryLabels: string[] }) {
  const content = CONTEXTUAL_CONTENT[item.skill.name]

  return (
    <article className="sa-connection-card">
      <div className="sa-connection-card__icon" aria-hidden>◎</div>
      <div>
        <div className="sa-connection-card__heading">
          <h3>{item.title}</h3>
          <span className="sa-badge">Chưa kích hoạt</span>
        </div>
        <p>{content?.description || item.skill.description || 'Năng lực này cần thiết lập thêm trước khi dùng.'}</p>
        <p className="sa-muted">{content?.how || 'Thiết lập yêu cầu của năng lực trong Hermes rồi thử lại.'}</p>
        <p>{contextualBenefit(item, workMemoryLabels)}</p>
        <button className="sa-button sa-button--secondary" type="button" onClick={() => host.notify({ kind: 'info', message: `Cần thiết lập ${item.title} trong Hermes.` })}>
          Hướng dẫn bật →
        </button>
      </div>
    </article>
  )
}

export function CapabilitiesView() {
  const [skills, setSkills] = useState<CapabilitySkill[]>([])
  const [activePill, setActivePill] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [platformOpen, setPlatformOpen] = useState(false)
  const [superAgentNames, setSuperAgentNames] = useState<string[]>([])
  const [workMemoryLabels, setWorkMemoryLabels] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    void loadCapabilities()
      .then(data => {
        if (mounted) {
          setSkills(data.skills)
          setSuperAgentNames(data.superAgentNames)
          setError(false)
        }
      })
      .catch(() => {
        if (mounted) {
          setSkills([])
          setError(true)
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void loadWorkMemoryLabels().then(labels => {
      if (mounted) setWorkMemoryLabels(labels)
    })
    return () => {
      mounted = false
    }
  }, [])

  const items = useMemo(() => toCapabilityViewModels(skills, superAgentNames), [skills, superAgentNames])
  const workItems = items.filter(item => item.layer === 'work' && (activePill === 'all' || item.area === activePill))
  const connectionItems = items.filter(item => item.layer === 'connection')
  const platformItems = items.filter(item => item.layer === 'platform')

  return (
    <main aria-label="Năng lực của Siêu trợ lý" className="sa-capabilities-page">
      <div className="sa-capabilities-page__inner">
        <header className="sa-capabilities-header">
          <div>
            <p className="sa-eyebrow">Siêu trợ lý</p>
            <h1>Năng lực của Siêu trợ lý</h1>
            <p>Những việc Siêu trợ lý làm được cho bạn. Trang kỹ thuật gốc nằm trong Chế độ nâng cao.</p>
          </div>
          <button className="sa-button sa-button--primary" type="button" onClick={() => host.notify({ kind: 'info', message: 'Mở tab Tạo việc mới' })}>
            ✦ Tạo việc mới
          </button>
        </header>

        <nav aria-label="Lọc năng lực" className="sa-capability-pills">
          {CAPABILITY_PILLS.map(pill => (
            <button aria-pressed={activePill === pill.id} className={activePill === pill.id ? 'sa-pill sa-pill--active' : 'sa-pill'} key={pill.id} onClick={() => setActivePill(pill.id)} type="button">
              {pill.label} {pill.id === 'all' ? workItems.length : items.filter(item => item.area === pill.id && item.layer === 'work').length}
            </button>
          ))}
        </nav>

        <div aria-label="Nguồn năng lực" className="sa-source-legend">
          {CAPABILITY_SOURCES.map(source => (
            <span key={source.id} title={source.description}>
              <i className="sa-source-dot" style={{ background: `var(--${source.token})` }} />
              {source.label}
            </span>
          ))}
        </div>

        {loading && <p role="status">Đang tải năng lực…</p>}
        {error && <p role="alert">Không tải được danh sách năng lực.</p>}
        {!loading && !error && workItems.length === 0 && <p className="sa-empty-state">Chưa có năng lực trong mảng này.</p>}
        {!loading && !error && workItems.length > 0 && <section aria-label="Việc" className="sa-capability-grid">{workItems.map(item => <CapabilityCard item={item} key={item.skill.name} workMemoryLabels={workMemoryLabels} />)}</section>}

        <section aria-labelledby="connections-heading">
          <div className="sa-section-label" id="connections-heading">Cần bật thêm mới dùng được</div>
          {connectionItems.length > 0 ? connectionItems.map(item => <ConnectionCard item={item} key={item.skill.name} workMemoryLabels={workMemoryLabels} />) : <p className="sa-empty-state">Chưa có dữ liệu kết nối cần thiết lập từ contract hiện tại.</p>}
        </section>

        <section aria-labelledby="platform-heading">
          <button className="sa-platform-row" id="platform-heading" onClick={() => setPlatformOpen(open => !open)} type="button" aria-expanded={platformOpen}>
            <span className="sa-source-dot" style={{ background: 'var(--src-hermes)' }} />
            <span><strong>Nền tảng</strong> — {platformItems.length} năng lực gốc luôn bật</span>
            <span className="sa-platform-row__action">{platformOpen ? 'Thu lại' : 'Xem'}</span>
          </button>
          {platformOpen && <div className="sa-platform-list">{platformItems.length ? platformItems.map(item => <span key={item.skill.name}>{item.title}</span>) : <span>Chưa có danh sách nền tảng.</span>}</div>}
        </section>
      </div>
    </main>
  )
}

export const capabilitiesRoute: RouteContribution = { path: CAPABILITIES_PATH }
export const capabilitiesNav: SidebarNavContribution = { codicon: 'sparkle', label: 'Năng lực', path: CAPABILITIES_PATH }

export const capabilitiesPlugin: HermesPlugin = {
  id: 'super-agent-capabilities',
  name: 'Super Agent Capabilities',
  defaultEnabled: true,
  register(ctx) {
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: capabilitiesRoute, render: () => <CapabilitiesView /> },
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 45, data: capabilitiesNav }
    ])
  }
}
