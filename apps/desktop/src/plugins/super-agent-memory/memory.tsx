/* eslint-disable no-restricted-imports -- approved BP-26B uses existing Hermes wrappers and UI primitives. */

import './memory.css'

import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import {
  deleteLearningNode,
  editLearningNode,
  getLearningNode,
  getProfileSoul,
  getStarmapGraph,
  updateProfileSoul
} from '../../hermes'
import { $activeProfile, normalizeProfileKey } from '../../store/profile'
import type { ProfileSoul, StarmapNode } from '../../types/hermes'

import { SOUL_TEMPLATES, type SoulTemplate } from './soul-templates'

export type MemoryGroupId = 'work' | 'workflow' | 'history' | 'skills'

export interface MemoryItem {
  id: string
  group: MemoryGroupId
  label: string
  kind: 'memory' | 'skill'
  useCount?: number
}

interface UndoSnapshot {
  id: string
  content: string
  item: MemoryItem
}

type MemorySection = 'memory' | 'style'

const GROUPS: Array<{ id: MemoryGroupId; title: string }> = [
  { id: 'work', title: 'Công việc của bạn' },
  { id: 'workflow', title: 'Cách bạn làm việc' },
  { id: 'history', title: 'Đã làm & kết quả' },
  { id: 'skills', title: 'Năng lực đã dùng' }
]

function groupForMemoryLabel(label: string): Exclude<MemoryGroupId, 'skills'> {
  const text = label.toLocaleLowerCase('vi')
  if (/(đã|kết quả|báo cáo|bài đăng|phải sửa|dùng được)/u.test(text)) {
    return 'history'
  }
  if (/(viết|đặt tên|giờ làm|phong cách|quy tắc|làm việc)/u.test(text)) {
    return 'workflow'
  }
  return 'work'
}

function itemFromNode(node: StarmapNode): MemoryItem | null {
  if (node.kind === 'memory') {
    return { id: node.id, group: groupForMemoryLabel(node.label), kind: 'memory', label: node.label }
  }
  if (node.useCount > 0) {
    return { id: node.id, group: 'skills', kind: 'skill', label: node.label, useCount: node.useCount }
  }
  return null
}

function normalizeSoulContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function matchingSoulTemplate(content: string): SoulTemplate | null {
  const normalized = normalizeSoulContent(content)
  return SOUL_TEMPLATES.find(template => normalizeSoulContent(template.content) === normalized) ?? null
}

function isCustomSoul(soul: ProfileSoul | null): boolean {
  if (!soul || !soul.exists || soul.content.trim() === '') {
    return false
  }

  return matchingSoulTemplate(soul.content) === null
}

export function memoryItemsFromNodes(nodes: StarmapNode[]): MemoryItem[] {
  return nodes.flatMap(node => {
    const item = itemFromNode(node)
    return item ? [item] : []
  })
}

function ErrorMessage({ children }: { children: string }) {
  return (
    <p className="sa-memory-page__error" role="alert">
      {children}
    </p>
  )
}

export function MemoryView() {
  const activeProfile = normalizeProfileKey(useStore($activeProfile))
  const [section, setSection] = useState<MemorySection>('memory')
  const [items, setItems] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ item: MemoryItem; content: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<UndoSnapshot | null>(null)
  const pendingDelete = useRef<{ snapshot: UndoSnapshot; timer: ReturnType<typeof setTimeout> } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const graph = await getStarmapGraph()
      setItems(memoryItemsFromNodes(graph.nodes))
      setError(null)
    } catch {
      setError('Không tải được bộ nhớ của bạn.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (pendingDelete.current) {
        clearTimeout(pendingDelete.current.timer)
      }
    }
  }, [load])

  const openEdit = async (item: MemoryItem) => {
    setActionError(null)
    try {
      const detail = await getLearningNode(item.id)
      setEditing({ item, content: detail.content })
    } catch {
      setActionError('Không mở được nội dung để sửa.')
    }
  }

  const saveEdit = async () => {
    if (!editing) {
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      const result = await editLearningNode(editing.item.id, editing.content)
      if (!result.ok) {
        throw new Error(result.message)
      }
      setEditing(null)
      await load()
    } catch {
      setActionError('Không lưu được thay đổi vào bộ nhớ Hermes.')
    } finally {
      setSaving(false)
    }
  }

  const removeItem = (item: MemoryItem) => {
    if (pendingDelete.current) {
      const previous = pendingDelete.current.snapshot.item
      clearTimeout(pendingDelete.current.timer)
      setItems(current => (current.some(candidate => candidate.id === previous.id) ? current : [...current, previous]))
    }
    const snapshot: UndoSnapshot = { id: item.id, content: item.label, item }
    const timer = setTimeout(async () => {
      if (pendingDelete.current?.snapshot.id !== snapshot.id) {
        return
      }
      try {
        const result = await deleteLearningNode(snapshot.id)
        if (!result.ok) {
          throw new Error(result.message)
        }
        pendingDelete.current = null
        setToast(null)
        await load()
      } catch {
        pendingDelete.current = null
        setToast(null)
        setActionError('Không xoá được mục khỏi bộ nhớ Hermes.')
        await load()
      }
    }, 5000)
    pendingDelete.current = { snapshot, timer }
    setItems(current => current.filter(candidate => candidate.id !== item.id))
    setToast(snapshot)
    void getLearningNode(item.id)
      .then(detail => {
        if (pendingDelete.current?.snapshot.id === item.id) {
          pendingDelete.current.snapshot.content = detail.content
        }
      })
      .catch(() => undefined)
  }

  const undo = () => {
    const pending = pendingDelete.current
    if (!pending) {
      return
    }
    clearTimeout(pending.timer)
    pendingDelete.current = null
    setItems(current => [...current, pending.snapshot.item])
    setToast(null)
  }

  return (
    <main aria-label="Siêu trợ lý của tôi" className="sa-memory-page">
      <div className="sa-memory-page__inner">
        <header className="sa-memory-header">
          <div>
            <p className="sa-memory-eyebrow">Siêu trợ lý</p>
            <h1>Siêu trợ lý của tôi</h1>
            <p>Bạn cũng có thể nói thẳng với Siêu trợ lý: «quên điều này đi».</p>
          </div>
        </header>

        <nav aria-label="Mục của Siêu trợ lý" className="sa-memory-tabs">
          <Button
            aria-current={section === 'memory' ? 'page' : undefined}
            onClick={() => setSection('memory')}
            type="button"
            variant={section === 'memory' ? 'default' : 'ghost'}
          >
            Về tôi
          </Button>
          <Button
            aria-current={section === 'style' ? 'page' : undefined}
            onClick={() => setSection('style')}
            type="button"
            variant={section === 'style' ? 'default' : 'ghost'}
          >
            Phong cách
          </Button>
        </nav>

        {loading && <p role="status">Đang tải bộ nhớ…</p>}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {actionError && <ErrorMessage>{actionError}</ErrorMessage>}

        {section === 'memory' && !loading && !error && (
          <div className="sa-memory-grid">
            {GROUPS.map(group => {
              const groupItems = items.filter(item => item.group === group.id)
              return (
                <section aria-labelledby={`memory-${group.id}`} className="sa-memory-card" key={group.id}>
                  <h2 id={`memory-${group.id}`}>{group.title}</h2>
                  <div className="sa-memory-card__content">
                    {groupItems.length === 0 && <p className="sa-memory-empty">Chưa có điều gì được ghi nhớ.</p>}
                    {groupItems.map(item => (
                      <div className="sa-memory-item" key={item.id}>
                        <span>{item.label}</span>
                        {item.kind === 'skill' && <small>{item.useCount} lần dùng</small>}
                        <Button
                          aria-label={`Sửa ${item.label}`}
                          onClick={() => void openEdit(item)}
                          size="sm"
                          variant="ghost"
                        >
                          Sửa
                        </Button>
                        <Button
                          aria-label={`Xoá ${item.label}`}
                          onClick={() => removeItem(item)}
                          size="sm"
                          variant="ghost"
                        >
                          Xoá
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {section === 'style' && <SoulStyleView key={activeProfile} profileName={activeProfile} />}
      </div>

      <Dialog onOpenChange={open => !open && !saving && setEditing(null)} open={Boolean(editing)}>
        <DialogContent className="sa-memory-dialog">
          <DialogHeader>
            <DialogTitle>Sửa {editing?.item.label}</DialogTitle>
          </DialogHeader>
          <textarea
            aria-label="Nội dung bộ nhớ"
            autoFocus
            className="sa-memory-editor"
            onChange={event => setEditing(current => (current ? { ...current, content: event.target.value } : current))}
            value={editing?.content ?? ''}
          />
          <DialogFooter>
            <Button disabled={saving} onClick={() => setEditing(null)} type="button" variant="ghost">
              Huỷ
            </Button>
            <Button disabled={saving} onClick={() => void saveEdit()} type="button">
              {saving ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="sa-memory-toast" role="status">
          <span>Đã xoá — Hoàn tác</span>
          <Button aria-label="Hoàn tác" onClick={undo} size="sm" variant="ghost">
            Hoàn tác
          </Button>
        </div>
      )}
    </main>
  )
}

function SoulStyleView({ profileName }: { profileName: string }) {
  const [soul, setSoul] = useState<ProfileSoul | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<SoulTemplate | null>(null)
  const requestProfile = useRef(profileName)

  const loadSoul = useCallback(async () => {
    requestProfile.current = profileName
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const nextSoul = await getProfileSoul(profileName)
      if (requestProfile.current === profileName) {
        setSoul(nextSoul)
        setSelectedTemplateId(matchingSoulTemplate(nextSoul.content)?.id ?? null)
      }
    } catch {
      if (requestProfile.current === profileName) {
        setSoul(null)
        setError('Không tải được SOUL.md của hồ sơ này.')
      }
    } finally {
      if (requestProfile.current === profileName) {
        setLoading(false)
      }
    }
  }, [profileName])

  useEffect(() => {
    void loadSoul()
  }, [loadSoul])

  const applyTemplate = async (template: SoulTemplate) => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const result = await updateProfileSoul(profileName, template.content)
      if (!result.ok) {
        throw new Error('SOUL update failed')
      }
      const latestSoul = await getProfileSoul(profileName)
      if (requestProfile.current !== profileName) {
        return
      }
      setSoul(latestSoul)
      setSelectedTemplateId(matchingSoulTemplate(latestSoul.content)?.id ?? null)
      setStatus(`Đã áp dụng phong cách ${template.label}.`)
    } catch {
      if (requestProfile.current === profileName) {
        setError('Không lưu được phong cách vào SOUL.md.')
      }
    } finally {
      if (requestProfile.current === profileName) {
        setSaving(false)
      }
    }
  }

  const selectTemplate = (template: SoulTemplate) => {
    if (!soul || loading || saving) {
      return
    }
    if (isCustomSoul(soul)) {
      setPendingTemplate(template)
      return
    }
    void applyTemplate(template)
  }

  const confirmTemplate = () => {
    if (!pendingTemplate) {
      return
    }
    const template = pendingTemplate
    setPendingTemplate(null)
    void applyTemplate(template)
  }

  return (
    <section aria-labelledby="sa-memory-style-title" className="sa-memory-style">
      <div className="sa-memory-style__intro">
        <div>
          <h2 id="sa-memory-style-title">Phong cách</h2>
          <p>Chọn cách Siêu trợ lý nói chuyện với bạn. Áp dụng cho hồ sơ {profileName}.</p>
        </div>
        {loading && <span role="status">Đang tải SOUL.md…</span>}
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {status && <p role="status">{status}</p>}

      <div aria-label="Các phong cách SOUL" className="sa-memory-style__grid">
        {SOUL_TEMPLATES.map(template => (
          <Button
            aria-pressed={selectedTemplateId === template.id}
            className="sa-memory-style__option"
            disabled={loading || saving || !soul}
            key={template.id}
            onClick={() => selectTemplate(template)}
            type="button"
            variant={selectedTemplateId === template.id ? 'secondary' : 'outline'}
          >
            {template.label}
          </Button>
        ))}
      </div>

      <Dialog
        onOpenChange={open => !open && !saving && setPendingTemplate(null)}
        open={pendingTemplate !== null}
      >
        <DialogContent className="sa-memory-dialog">
          <DialogHeader>
            <DialogTitle>Ghi đè SOUL.md?</DialogTitle>
            <DialogDescription>
              SOUL.md hiện tại sẽ bị thay thế bằng phong cách {pendingTemplate?.label}. Bạn có chắc muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={saving} onClick={() => setPendingTemplate(null)} type="button" variant="ghost">
              Huỷ
            </Button>
            <Button disabled={saving} onClick={confirmTemplate} type="button">
              {saving ? 'Đang lưu…' : 'Xác nhận ghi đè'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
