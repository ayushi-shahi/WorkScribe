import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Hash, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getWikiSpacesApi,
  getPageTreeApi,
  createWikiSpaceApi,
  createPageApi,
  updatePageApi,
} from '@/api/endpoints/wiki'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import PageTree from '@/components/wiki/PageTree'
import type { WikiSpace } from '@/types'
import type { PageTreeNode } from '@/api/endpoints/wiki'
import '@/styles/wiki.css'

function nameToKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
}

export default function WikiLayout() {
  const { slug, spaceId } = useParams<{ slug: string; spaceId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [newPageParent, setNewPageParent] = useState<string | null | undefined>(undefined)
  const [renameState, setRenameState] = useState<{ pageId: string; title: string } | null>(null)

  // ── Fetch current user's role ──────────────────────────────
  const { data: rawMembers } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const members = (() => {
    if (!rawMembers) return []
    if (Array.isArray(rawMembers)) return rawMembers
    return (rawMembers as { members?: typeof rawMembers[] }).members ?? []
  })()

  const currentMember = members.find((m: any) => m.user_id === currentUser?.id)
  const currentRole   = currentMember?.role ?? 'member'
  const canManage     = currentRole === 'owner' || currentRole === 'admin'

  // ── Listen for custom events ───────────────────────────────
  useEffect(() => {
    const handleNewSpace = () => {
      if (canManage) setNewSpaceOpen(true)
    }
    const handleNewPage = (e: Event) => {
      const detail = (e as CustomEvent<{ spaceId?: string }>).detail
      if (!detail?.spaceId || detail.spaceId === spaceId) {
        setNewPageParent(null)
      }
    }
    window.addEventListener('wiki:new-space', handleNewSpace)
    window.addEventListener('wiki:new-page', handleNewPage)
    return () => {
      window.removeEventListener('wiki:new-space', handleNewSpace)
      window.removeEventListener('wiki:new-page', handleNewPage)
    }
  }, [spaceId, canManage])

  // ── Queries ────────────────────────────────────────────────
  const { data: spaces = [] } = useQuery({
    queryKey: ['wiki-spaces', slug],
    queryFn: () => getWikiSpacesApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const { data: rawPageTree } = useQuery({
    queryKey: ['page-tree', spaceId],
    queryFn: () => getPageTreeApi(spaceId ?? ''),
    enabled: !!spaceId,
    staleTime: 30_000,
  })
  const pageTree: PageTreeNode[] = Array.isArray(rawPageTree) ? rawPageTree : []

  const activeSpace = spaces.find((s) => s.id === spaceId) ?? null

  // ── Create page mutation ───────────────────────────────────
  const createPageMutation = useMutation({
    mutationFn: ({ title, parentPageId }: { title: string; parentPageId: string | null }) =>
      createPageApi(spaceId ?? '', {
        title,
        parent_page_id: parentPageId ?? undefined,
      }),
    onSuccess: (page) => {
      toast.success('Page created')
      queryClient.invalidateQueries({ queryKey: ['page-tree', spaceId] })
      navigate(`/org/${slug}/wiki/${spaceId}/${page.id}`)
      setNewPageParent(undefined)
    },
    onError: () => toast.error('Failed to create page'),
  })

  // ── Rename page mutation ───────────────────────────────────
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updatePageApi(id, { title }),
    onSuccess: () => {
      toast.success('Page renamed')
      queryClient.invalidateQueries({ queryKey: ['page-tree', spaceId] })
      setRenameState(null)
    },
    onError: () => toast.error('Failed to rename page'),
  })

  return (
    <div className="wiki-shell">
      {/* ── Col 1: Spaces ──────────────────────────────────── */}
      <aside className="wiki-spaces-col">
        <div className="wiki-spaces-header">
          <span className="wiki-spaces-label">Wiki</span>
          {/* Only owner/admin can create spaces */}
          {canManage && (
            <button
              className="wiki-icon-btn"
              title="New space"
              onClick={() => setNewSpaceOpen(true)}
            >
              <Plus size={13} />
            </button>
          )}
        </div>
        <div className="wiki-spaces-list">
          {spaces.length === 0 && (
            <div className="wiki-empty-hint">No spaces yet</div>
          )}
          {spaces.map((space) => (
            <SpaceItem
              key={space.id}
              space={space}
              isActive={space.id === spaceId}
              onNavigate={(id) => navigate(`/org/${slug}/wiki/${id}`)}
            />
          ))}
        </div>
      </aside>

      {/* ── Col 2: Page tree ───────────────────────────────── */}
      <aside className="wiki-tree-col">
        {activeSpace ? (
          <>
            <div className="wiki-tree-header">
              <span className="wiki-space-icon">
                {activeSpace.icon_emoji ? (
                  <span style={{ fontSize: 14 }}>{activeSpace.icon_emoji}</span>
                ) : (
                  <BookOpen size={14} />
                )}
              </span>
              <span className="wiki-tree-space-name">{activeSpace.name}</span>
              {/* All members can create pages */}
              <button
                className="wiki-icon-btn"
                title="New page"
                onClick={() => setNewPageParent(null)}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="wiki-tree-body">
              {pageTree.length === 0 && newPageParent === undefined && (
                <div className="wiki-empty-hint wiki-empty-hint--tree">
                  <FileText size={28} strokeWidth={1.5} />
                  <span>No pages yet</span>
                  <button
                    className="wiki-new-page-btn"
                    onClick={() => setNewPageParent(null)}
                  >
                    Create first page
                  </button>
                </div>
              )}

              {pageTree.length > 0 && (
                <PageTree
                  nodes={pageTree}
                  spaceId={spaceId ?? ''}
                  onNewPage={(parentId) => setNewPageParent(parentId)}
                  onRenamePage={(pid, title) => setRenameState({ pageId: pid, title })}
                />
              )}

              {newPageParent === null && (
                <InlineNewPage
                  depth={0}
                  onConfirm={(title) =>
                    createPageMutation.mutate({ title, parentPageId: null })
                  }
                  onCancel={() => setNewPageParent(undefined)}
                  isLoading={createPageMutation.isPending}
                />
              )}

              {newPageParent !== null && newPageParent !== undefined && (
                <InlineNewPage
                  depth={1}
                  onConfirm={(title) =>
                    createPageMutation.mutate({ title, parentPageId: newPageParent })
                  }
                  onCancel={() => setNewPageParent(undefined)}
                  isLoading={createPageMutation.isPending}
                />
              )}
            </div>
          </>
        ) : (
          <div className="wiki-tree-placeholder">
            <Hash size={24} strokeWidth={1.5} />
            <span>Select a space</span>
          </div>
        )}
      </aside>

      {/* ── Col 3: Content ─────────────────────────────────── */}
      <main className="wiki-editor-col">
        <Outlet context={{ spaces, pageTree, activeSpace }} />
      </main>

      {/* ── Modals ─────────────────────────────────────────── */}
      {newSpaceOpen && canManage && (
        <NewSpaceModal
          slug={slug ?? ''}
          onClose={() => setNewSpaceOpen(false)}
          onCreated={(space) => {
            queryClient.invalidateQueries({ queryKey: ['wiki-spaces', slug] })
            setNewSpaceOpen(false)
            navigate(`/org/${slug}/wiki/${space.id}`)
          }}
        />
      )}
      {renameState && (
        <RenamePageModal
          initialTitle={renameState.title}
          onConfirm={(title) =>
            renameMutation.mutate({ id: renameState.pageId, title })
          }
          onClose={() => setRenameState(null)}
          isLoading={renameMutation.isPending}
        />
      )}
    </div>
  )
}

// ── SpaceItem ──────────────────────────────────────────────────────────────────

function SpaceItem({
  space,
  isActive,
  onNavigate,
}: {
  space: WikiSpace
  isActive: boolean
  onNavigate: (id: string) => void
}) {
  return (
    <button
      className={`wiki-space-item${isActive ? ' active' : ''}`}
      onClick={() => onNavigate(space.id)}
    >
      <span className="wiki-space-item-icon">
        {space.icon_emoji ? (
          <span style={{ fontSize: 14 }}>{space.icon_emoji}</span>
        ) : (
          <BookOpen size={14} />
        )}
      </span>
      <span className="wiki-space-item-name">{space.name}</span>
    </button>
  )
}

// ── InlineNewPage ──────────────────────────────────────────────────────────────

function InlineNewPage({
  depth,
  onConfirm,
  onCancel,
  isLoading,
}: {
  depth: number
  onConfirm: (title: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && title.trim()) {
      onConfirm(title.trim())
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div
      className="wiki-inline-new-page"
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <FileText size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        className="wiki-inline-new-page-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (!title.trim()) onCancel() }}
        placeholder="Page title…"
        disabled={isLoading}
      />
    </div>
  )
}

// ── NewSpaceModal ──────────────────────────────────────────────────────────────

function NewSpaceModal({
  slug,
  onClose,
  onCreated,
}: {
  slug: string
  onClose: () => void
  onCreated: (space: WikiSpace) => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setIsLoading(true)
    try {
      const space = await createWikiSpaceApi(slug, {
        name: trimmedName,
        key: nameToKey(trimmedName),
        icon_emoji: emoji.trim() || undefined,
      })
      onCreated(space)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create space'
      toast.error(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div
        className="wiki-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New space"
      >
        <div className="wiki-modal-header">
          <span className="wiki-modal-title">New Wiki Space</span>
          <button className="wiki-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="wiki-modal-body">
          <div className="wiki-modal-row">
            <label className="wiki-modal-label" htmlFor="space-emoji">Emoji</label>
            <input
              id="space-emoji"
              className="wiki-modal-input wiki-modal-input--emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="📋"
              maxLength={4}
            />
          </div>
          <div className="wiki-modal-row">
            <label className="wiki-modal-label" htmlFor="space-name">
              Name <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              id="space-name"
              ref={inputRef}
              className="wiki-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering"
              required
              maxLength={80}
            />
          </div>
          {name.trim() && (
            <p className="wiki-modal-hint">
              Key: <code className="wiki-modal-key-preview">{nameToKey(name)}</code>
            </p>
          )}
          <div className="wiki-modal-footer">
            <button type="button" className="wiki-btn wiki-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="wiki-btn wiki-btn--primary"
              disabled={!name.trim() || isLoading}
            >
              {isLoading ? 'Creating…' : 'Create Space'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── RenamePageModal ────────────────────────────────────────────────────────────

function RenamePageModal({
  initialTitle,
  onConfirm,
  onClose,
  isLoading,
}: {
  initialTitle: string
  onConfirm: (title: string) => void
  onClose: () => void
  isLoading: boolean
}) {
  const [title, setTitle] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim()) onConfirm(title.trim())
  }

  return (
    <div className="wiki-modal-overlay" onClick={onClose}>
      <div
        className="wiki-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Rename page"
      >
        <div className="wiki-modal-header">
          <span className="wiki-modal-title">Rename Page</span>
          <button className="wiki-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="wiki-modal-body">
          <div className="wiki-modal-row">
            <label className="wiki-modal-label" htmlFor="rename-title">Title</label>
            <input
              id="rename-title"
              ref={inputRef}
              className="wiki-modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="wiki-modal-footer">
            <button type="button" className="wiki-btn wiki-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="wiki-btn wiki-btn--primary"
              disabled={!title.trim() || isLoading}
            >
              {isLoading ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}