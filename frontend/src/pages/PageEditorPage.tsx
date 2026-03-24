import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useParams, useOutletContext, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Clock, Save } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getPageApi, updatePageApi } from '@/api/endpoints/wiki'
import { clearDraft } from '@/components/wiki/WikiEditor'
import type { WikiEditorHandle } from '@/components/wiki/WikiEditor'
import type { WikiSpace, Page } from '@/types'
import type { PageTreeNode } from '@/api/endpoints/wiki'
import '@/styles/wiki.css'

// Lazy-load the heavy Tiptap editor — page shell renders instantly,
// editor bundle loads in the background
const WikiEditor = lazy(() => import('@/components/wiki/WikiEditor'))

// ── Outlet context ─────────────────────────────────────────────────────────────

interface WikiOutletContext {
  spaces: WikiSpace[]
  pageTree: PageTreeNode[]
  activeSpace: WikiSpace | null
}

// ── Editor skeleton shown while WikiEditor bundle loads ────────────────────────

function EditorSkeleton() {
  return (
    <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ width: '90%', height: 14, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: '75%', height: 14, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: '82%', height: 14, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: '60%', height: 14, borderRadius: 4 }} />
      <div className="skeleton" style={{ width: '70%', height: 14, borderRadius: 4, marginTop: 8 }} />
      <div className="skeleton" style={{ width: '85%', height: 14, borderRadius: 4 }} />
    </div>
  )
}

// ── PageEditorPage ─────────────────────────────────────────────────────────────

export default function PageEditorPage() {
  const { slug, spaceId, pageId } = useParams<{
    slug: string
    spaceId: string
    pageId: string
  }>()
  const queryClient = useQueryClient()

  const ctx = useOutletContext<WikiOutletContext | null>()
  const activeSpace = ctx?.activeSpace ?? null

  // ── Fetch page ──────────────────────────────────────────────
  const { data: page, isLoading } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => getPageApi(pageId ?? ''),
    enabled: !!pageId,
    staleTime: 30_000,
  })

  // ── Editable title ───────────────────────────────────────────
  const [titleValue, setTitleValue] = useState('')
  const [titleFocused, setTitleFocused] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (page && !titleFocused) setTitleValue(page.title)
  }, [page, titleFocused])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [titleValue])

  // ── Title save mutation ──────────────────────────────────────
  const titleMutation = useMutation({
    mutationFn: (title: string) => updatePageApi(pageId ?? '', { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-tree', spaceId] })
      queryClient.invalidateQueries({ queryKey: ['page', pageId] })
    },
  })

  const scheduleTitleSave = useCallback(
    (title: string) => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
      titleSaveTimer.current = setTimeout(() => {
        if (title.trim() && title !== page?.title) {
          titleMutation.mutate(title.trim())
        }
      }, 800)
    },
    [page?.title, titleMutation]
  )

  function handleTitleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTitleValue(e.target.value)
    scheduleTitleSave(e.target.value)
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      editorRef.current?.focus()
    }
  }

  // ── Content save state ───────────────────────────────────────
  const editorRef = useRef<WikiEditorHandle>(null)
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // ── Content save mutation ────────────────────────────────────
  const contentMutation = useMutation({
    mutationFn: (json: Record<string, unknown>) =>
      updatePageApi(pageId ?? '', { content_json: json }),
    onSuccess: () => {
      if (pageId) clearDraft(pageId)
      queryClient.invalidateQueries({ queryKey: ['page', pageId] })
      setIsSaving(false)
      setIsDirty(false)
      setSavedFlash(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2500)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  // ── Manual save ──────────────────────────────────────────────
  const saveNow = useCallback(() => {
    if (!editorRef.current || !isDirty) return
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current)
    const json = editorRef.current.getJSON()
    setIsSaving(true)
    contentMutation.mutate(json)
  }, [isDirty, contentMutation])

  // ── Cmd/Ctrl+S shortcut ──────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveNow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveNow])

  // ── Debounced autosave triggered by editor onChange ──────────
  const handleEditorChange = useCallback(
    (json: Record<string, unknown>) => {
      setIsDirty(true)
      setSavedFlash(false)
      if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current)
      contentSaveTimer.current = setTimeout(() => {
        setIsSaving(true)
        contentMutation.mutate(json)
      }, 1500)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId]
  )

  // ── Tab title unsaved indicator ──────────────────────────────
  useEffect(() => {
    const base = 'WorkScribe'
    document.title = isDirty ? `• ${base}` : base
    return () => { document.title = base }
  }, [isDirty])

  // Reset dirty state when navigating to a different page
  useEffect(() => {
    setIsDirty(false)
    setIsSaving(false)
    setSavedFlash(false)
  }, [pageId])

  // ── Loading skeleton ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="wiki-page-shell">
        <div className="wiki-breadcrumb">
          <div className="skeleton" style={{ width: 80, height: 12, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 120, height: 12, borderRadius: 4, marginLeft: 8 }} />
        </div>
        <div className="wiki-page-title-wrap">
          <div className="skeleton" style={{ width: '60%', height: 40, borderRadius: 6, marginTop: 8 }} />
        </div>
        <div className="wiki-page-meta" style={{ marginTop: 12 }}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 4 }} />
        </div>
        <div className="wiki-page-divider" />
        <EditorSkeleton />
      </div>
    )
  }

  if (!page) return null

  const showSaving = isSaving || titleMutation.isPending
  const showSaved = savedFlash && !isSaving && !titleMutation.isPending

  return (
    <div className="wiki-page-shell">
      {/* ── Breadcrumb ────────────────────────────────── */}
      <div className="wiki-breadcrumb">
        <Link
          to={`/org/${slug}/wiki/${spaceId}`}
          className="wiki-breadcrumb-item wiki-breadcrumb-item--link"
        >
          {activeSpace?.icon_emoji ? (
            <span className="wiki-breadcrumb-emoji">{activeSpace.icon_emoji}</span>
          ) : null}
          {activeSpace?.name ?? 'Wiki'}
        </Link>
        <ChevronRight size={12} className="wiki-breadcrumb-sep" />
        <span className="wiki-breadcrumb-item wiki-breadcrumb-item--current">
          {page.title}
        </span>
      </div>

      {/* ── Editable title ────────────────────────────── */}
      <div className="wiki-page-title-wrap">
        <textarea
          ref={titleRef}
          className="wiki-page-title-input"
          value={titleValue}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => {
            setTitleFocused(false)
            if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
            if (titleValue.trim() && titleValue.trim() !== page.title) {
              titleMutation.mutate(titleValue.trim())
            }
          }}
          placeholder="Untitled"
          rows={1}
          spellCheck={false}
        />
      </div>

      {/* ── Meta row ──────────────────────────────────── */}
      <div className="wiki-page-meta">
        <AuthorAvatar page={page} />
        <span className="wiki-page-meta-text">
          <Clock size={11} />
          {page.updated_at
            ? `Edited ${formatDistanceToNow(new Date(page.updated_at), { addSuffix: true })}`
            : 'Just created'}
        </span>

        {showSaving && (
          <span className="wiki-page-save-indicator">Saving…</span>
        )}
        {showSaved && (
          <span className="wiki-page-save-indicator wiki-page-save-indicator--saved">
            Saved
          </span>
        )}

        <button
          type="button"
          className={`wiki-save-btn${isDirty ? ' wiki-save-btn--dirty' : ''}`}
          onClick={saveNow}
          disabled={!isDirty || isSaving}
          title="Save (⌘S)"
        >
          <Save size={12} />
          {isDirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {/* ── Divider ───────────────────────────────────── */}
      <div className="wiki-page-divider" />

      {/* ── Tiptap editor (lazy loaded) ───────────────── */}
      <div className="wiki-page-editor-area" id="wiki-editor-mount">
        <Suspense fallback={<EditorSkeleton />}>
          <WikiEditor
            ref={editorRef}
            pageId={pageId ?? ''}
            initialContent={page.content_json ?? null}
            onChange={handleEditorChange}
          />
        </Suspense>
      </div>
    </div>
  )
}

// ── AuthorAvatar ───────────────────────────────────────────────────────────────

function AuthorAvatar({ page }: { page: Page }) {
  const initials = 'A'
  return (
    <span className="wiki-page-meta-avatar avatar avatar-xs" title="Author">
      {initials}
    </span>
  )
}