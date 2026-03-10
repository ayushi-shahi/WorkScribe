import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ExternalLink, Send, ChevronDown, Check } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { getTaskApi, updateTaskApi } from '@/api/endpoints/tasks'
import { getProjectStatusesApi } from '@/api/endpoints/projects'
import { getCommentsApi, createCommentApi } from '@/api/endpoints/comments'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import { priorityColor, statusColor, getInitials } from '@/lib/taskHelpers'
import '@/styles/taskPanel.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High'   },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low'    },
  { value: 'none',   label: 'None'   },
] as const

type PriorityValue = typeof PRIORITY_OPTIONS[number]['value']

// ── Debounce util ─────────────────────────────────────────────────────────────

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── useClickOutside hook ──────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

// ── StatusDropdown ────────────────────────────────────────────────────────────

interface StatusDropdownProps {
  currentStatusId: string
  statuses: import('@/types').TaskStatus[]
  onSelect: (statusId: string) => void
  disabled?: boolean
}

function StatusDropdown({ currentStatusId, statuses, onSelect, disabled }: StatusDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const current = statuses.find((s) => s.id === currentStatusId)

  function handleSelect(statusId: string) {
    onSelect(statusId)
    setOpen(false)
  }

  return (
    <div className="tp-dropdown-wrap" ref={ref}>
      <button
        className="tp-field-btn"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <span
          className="tp-status-dot"
          style={{ background: statusColor(current?.category ?? 'todo') }}
        />
        <span className="tp-field-btn-text">{current?.name ?? '—'}</span>
        <ChevronDown size={11} className="tp-chevron" />
      </button>

      {open && (
        <div className="tp-dropdown">
          {statuses.map((s) => (
            <button
              key={s.id}
              className={`tp-dropdown-item${s.id === currentStatusId ? ' tp-dropdown-item--active' : ''}`}
              onClick={() => handleSelect(s.id)}
            >
              <span
                className="tp-status-dot"
                style={{ background: statusColor(s.category) }}
              />
              <span className="tp-dropdown-item-label">{s.name}</span>
              {s.id === currentStatusId && <Check size={11} className="tp-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PriorityDropdown ──────────────────────────────────────────────────────────

interface PriorityDropdownProps {
  current: PriorityValue
  onSelect: (priority: PriorityValue) => void
  disabled?: boolean
}

function PriorityDropdown({ current, onSelect, disabled }: PriorityDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function handleSelect(value: PriorityValue) {
    onSelect(value)
    setOpen(false)
  }

  return (
    <div className="tp-dropdown-wrap" ref={ref}>
      <button
        className={`tp-field-btn tp-priority-btn tp-priority-btn--${current}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <span
          className="tp-priority-dot"
          style={{ background: priorityColor(current) }}
        />
        <span className="tp-field-btn-text" style={{ textTransform: 'capitalize' }}>
          {current}
        </span>
        <ChevronDown size={11} className="tp-chevron" />
      </button>

      {open && (
        <div className="tp-dropdown">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`tp-dropdown-item${opt.value === current ? ' tp-dropdown-item--active' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span
                className="tp-priority-dot"
                style={{ background: priorityColor(opt.value) }}
              />
              <span className="tp-dropdown-item-label">{opt.label}</span>
              {opt.value === current && <Check size={11} className="tp-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AssigneeDropdown ──────────────────────────────────────────────────────────

interface AssigneeDropdownProps {
  currentAssigneeId: string | null
  currentAssigneeName: string | null
  slug: string
  onSelect: (userId: string | null) => void
  disabled?: boolean
}

function AssigneeDropdown({
  currentAssigneeId,
  currentAssigneeName,
  slug,
  onSelect,
  disabled,
}: AssigneeDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useClickOutside(ref, () => { setOpen(false); setSearch('') })

  const { data: membersData } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug),
    enabled: open,
    staleTime: 60_000,
  })

  const members = Array.isArray(membersData?.members) ? membersData.members : []
  const filtered = members.filter((m) =>
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  )

  function handleOpen() {
    if (disabled) return
    setOpen((o) => !o)
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function handleSelect(userId: string | null) {
    onSelect(userId)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="tp-dropdown-wrap" ref={ref}>
      <button className="tp-field-btn" onClick={handleOpen} disabled={disabled}>
        {currentAssigneeId ? (
          <>
            <span className="tp-assignee-avatar">
              {getInitials(currentAssigneeName ?? '?')}
            </span>
            <span className="tp-field-btn-text">{currentAssigneeName}</span>
          </>
        ) : (
          <span className="tp-field-btn-text tp-field-btn-text--muted">Unassigned</span>
        )}
        <ChevronDown size={11} className="tp-chevron" />
      </button>

      {open && (
        <div className="tp-dropdown tp-dropdown--assignee">
          <div className="tp-dropdown-search-wrap">
            <input
              ref={searchRef}
              className="tp-dropdown-search"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setSearch('') } }}
            />
          </div>
          <div className="tp-dropdown-list">
            <button
              className={`tp-dropdown-item${!currentAssigneeId ? ' tp-dropdown-item--active' : ''}`}
              onClick={() => handleSelect(null)}
            >
              <span className="tp-assignee-avatar tp-assignee-avatar--empty">—</span>
              <span className="tp-dropdown-item-label">Unassigned</span>
              {!currentAssigneeId && <Check size={11} className="tp-check" />}
            </button>
            {filtered.map((m) => (
              <button
                key={m.user_id}
                className={`tp-dropdown-item${m.user_id === currentAssigneeId ? ' tp-dropdown-item--active' : ''}`}
                onClick={() => handleSelect(m.user_id)}
              >
                <span className="tp-assignee-avatar">
                  {getInitials(m.display_name)}
                </span>
                <div className="tp-assignee-info">
                  <span className="tp-dropdown-item-label">{m.display_name}</span>
                  <span className="tp-assignee-email">{m.email}</span>
                </div>
                {m.user_id === currentAssigneeId && <Check size={11} className="tp-check" />}
              </button>
            ))}
            {filtered.length === 0 && search && (
              <div className="tp-dropdown-empty">No members found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

export default function TaskPanel() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const taskIdParam = searchParams.get('task')

  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const debouncedTitle = useDebounce(title, 600)

  const resolvedId = useResolveTaskId(taskIdParam, slug)

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', resolvedId],
    queryFn: () => getTaskApi(resolvedId!),
    enabled: !!resolvedId,
    staleTime: 30_000,
  })

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses', slug, task?.project_id],
    queryFn: () => getProjectStatusesApi(slug ?? '', task?.project_id ?? ''),
    enabled: !!slug && !!task?.project_id,
    staleTime: 60_000,
  })

  const { data: commentData } = useQuery({
    queryKey: ['comments', resolvedId],
    queryFn: () => getCommentsApi(resolvedId!),
    enabled: !!resolvedId,
    staleTime: 30_000,
  })
  const comments = commentData?.comments ?? []

  useEffect(() => {
    if (task) setTitle(task.title)
  }, [task?.id])

  // ── Title autosave ────────────────────────────────────────────────────────
  const titleMutation = useMutation({
    mutationFn: (newTitle: string) =>
      updateTaskApi(resolvedId!, { title: newTitle }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
  })

  useEffect(() => {
    if (!task) return
    if (debouncedTitle === task.title) return
    if (debouncedTitle.trim().length < 1) return
    titleMutation.mutate(debouncedTitle)
  }, [debouncedTitle])

  // ── Status mutation ───────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: (statusId: string) =>
      updateTaskApi(resolvedId!, { status_id: statusId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Priority mutation ─────────────────────────────────────────────────────
  const priorityMutation = useMutation({
    mutationFn: (priority: PriorityValue) =>
      updateTaskApi(resolvedId!, { priority }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Assignee mutation ─────────────────────────────────────────────────────
  const assigneeMutation = useMutation({
    mutationFn: (assigneeId: string | null) =>
      updateTaskApi(resolvedId!, { assignee_id: assigneeId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Description editor ────────────────────────────────────────────────────
  const DRAFT_KEY = `task-desc-draft:${resolvedId}`

  const descMutation = useMutation({
    mutationFn: (json: Record<string, unknown>) =>
      updateTaskApi(resolvedId!, { description_json: json }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      localStorage.removeItem(DRAFT_KEY)
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedDescSave = useCallback(
    debounce((json: Record<string, unknown>) => {
      descMutation.mutate(json)
    }, 1500),
    [resolvedId]
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Add a description…' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'tp-editor-content',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as Record<string, unknown>
      localStorage.setItem(DRAFT_KEY, JSON.stringify(json))
      debouncedDescSave(json)
    },
  })

  // Load content when task loads — prefer localStorage draft
  useEffect(() => {
    if (!editor || !task) return
    const draft = localStorage.getItem(DRAFT_KEY)
    const content = draft
      ? JSON.parse(draft)
      : (task.description_json ?? '')
    editor.commands.setContent(content, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, editor])

  // ── Comment submit ────────────────────────────────────────────────────────
  const commentMutation = useMutation({
    mutationFn: () => createCommentApi(resolvedId!, comment.trim()),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['comments', resolvedId] })
    },
  })

  // ── Close ─────────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams)
    params.delete('task')
    navigate({ search: params.toString() }, { replace: true })
  }, [navigate, searchParams])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  if (!taskIdParam) return null

  return (
    <>
      <div className="task-panel-overlay" onClick={close} />

      <div className="task-panel" role="dialog" aria-modal="true">
        {/* Topbar */}
        <div className="task-panel-topbar">
          <span className="task-panel-id">{task?.task_id ?? taskIdParam}</span>
          <div className="task-panel-spacer" />
          <button
            className="task-panel-icon-btn"
            title="Open full page"
            onClick={() => alert('Full page view — coming soon')}
          >
            <ExternalLink size={14} />
          </button>
          <button className="task-panel-icon-btn" title="Close" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        {isLoading || !task ? (
          <div className="task-panel-skeleton">
            <div className="skeleton" style={{ height: 28, width: '70%' }} />
            <div className="skeleton" style={{ height: 16, width: '40%' }} />
            <div className="skeleton" style={{ height: 16, width: '55%' }} />
            <div className="skeleton" style={{ height: 16, width: '35%' }} />
            <div className="skeleton" style={{ height: 1, width: '100%' }} />
            <div className="skeleton" style={{ height: 80, width: '100%' }} />
          </div>
        ) : (
          <div className="task-panel-body">
            {/* Title */}
            <textarea
              ref={titleRef}
              className="task-panel-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              rows={1}
              spellCheck={false}
            />

            {/* Meta grid */}
            <div className="task-panel-meta">
              {/* Status */}
              <span className="task-meta-label">Status</span>
              <div className="task-meta-value">
                <StatusDropdown
                  currentStatusId={task.status_id}
                  statuses={statuses}
                  onSelect={(id) => statusMutation.mutate(id)}
                  disabled={statusMutation.isPending}
                />
              </div>

              {/* Priority */}
              <span className="task-meta-label">Priority</span>
              <div className="task-meta-value">
                <PriorityDropdown
                  current={(task.priority as PriorityValue) ?? 'none'}
                  onSelect={(p) => priorityMutation.mutate(p)}
                  disabled={priorityMutation.isPending}
                />
              </div>

              {/* Assignee */}
              <span className="task-meta-label">Assignee</span>
              <div className="task-meta-value">
                <AssigneeDropdown
                  currentAssigneeId={task.assignee_id}
                  currentAssigneeName={task.assignee?.display_name ?? null}
                  slug={slug ?? ''}
                  onSelect={(id) => assigneeMutation.mutate(id)}
                  disabled={assigneeMutation.isPending}
                />
              </div>

              {/* Type */}
              <span className="task-meta-label">Type</span>
              <div className="task-meta-value">
                <span style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font)',
                  textTransform: 'capitalize',
                  paddingLeft: 8,
                }}>
                  {task.type ?? 'task'}
                </span>
              </div>

              {/* Due date */}
              {task.due_date && (
                <>
                  <span className="task-meta-label">Due date</span>
                  <div className="task-meta-value">
                    <span style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font)',
                      paddingLeft: 8,
                    }}>
                      {new Date(task.due_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                </>
              )}

              {/* Labels */}
              {task.labels.length > 0 && (
                <>
                  <span className="task-meta-label">Labels</span>
                  <div className="task-meta-value" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {task.labels.map((label) => (
                      <span key={label.id} className="task-label-chip">
                        {label.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="task-panel-divider" />

            {/* Description */}
            <div>
              <div className="tp-editor-header">
                <span className="task-panel-section-label" style={{ marginBottom: 0 }}>
                  Description
                </span>
                {editor && (
                  <div className="tp-editor-toolbar">
                    <button
                      type="button"
                      className={`tp-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
                      title="Bold"
                    >
                      <strong>B</strong>
                    </button>
                    <button
                      type="button"
                      className={`tp-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
                      title="Italic"
                    >
                      <em>I</em>
                    </button>
                    <button
                      type="button"
                      className={`tp-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
                      title="Bullet list"
                    >
                      •–
                    </button>
                    <button
                      type="button"
                      className={`tp-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
                      title="Numbered list"
                    >
                      1.
                    </button>
                    <span className="tp-editor-save-status">
                      {descMutation.isPending ? 'Saving…' : descMutation.isSuccess ? 'Saved' : ''}
                    </span>
                  </div>
                )}
              </div>
              <EditorContent editor={editor} className="tp-editor-wrap" />
            </div>

            <div className="task-panel-divider" />

            {/* Comments */}
            <div>
              <div className="task-panel-section-label">
                Comments {comments.length > 0 && `(${comments.length})`}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                {comments.map((c) => (
                  <div key={c.id} className="task-comment">
                    <div className="avatar avatar-xs">
                      {getInitials(c.author.display_name)}
                    </div>
                    <div className="task-comment-body">
                      <div className="task-comment-header">
                        <span className="task-comment-author">{c.author.display_name}</span>
                        <span className="task-comment-time">
                          {new Date(c.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="task-comment-text">{c.content}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comment input */}
              <div className="task-comment-input-row">
                {user && (
                  <div className="avatar avatar-xs" style={{ marginTop: 3 }}>
                    {getInitials(user.display_name)}
                  </div>
                )}
                <textarea
                  className="task-comment-input"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      if (comment.trim()) commentMutation.mutate()
                    }
                  }}
                  rows={1}
                />
                <button
                  className="task-comment-submit"
                  disabled={!comment.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate()}
                  title="Submit (Cmd+Enter)"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Hook: resolve "APP-1" → uuid ──────────────────────────────────────────────
import { useMemo } from 'react'

function useResolveTaskId(
  taskIdParam: string | null,
  slug: string | undefined
): string | null {
  const queryClient = useQueryClient()

  return useMemo(() => {
    if (!taskIdParam) return null

    // Search board cache
    const boardQueries = queryClient.getQueriesData<{ tasks: import('@/types').Task[] }>({
      queryKey: ['board', slug],
    })
    for (const [, data] of boardQueries) {
      if (!data?.tasks) continue
      const found = data.tasks.find((t) => t.task_id === taskIdParam)
      if (found) return found.id
    }

    // Match by number extracted from task_id (e.g. "APP-2" → 2)
    const numMatch = taskIdParam.match(/-(\d+)$/)
    if (numMatch) {
      const num = parseInt(numMatch[1], 10)
      for (const [, data] of boardQueries) {
        if (!data?.tasks) continue
        const found = data.tasks.find((t) => t.number === num)
        if (found) return found.id
      }
    }

    // Search backlog cache
    const backlogQueries = queryClient.getQueriesData<{ tasks: import('@/types').Task[] }>({
      queryKey: ['backlog-tasks', slug],
    })
    for (const [, data] of backlogQueries) {
      if (!data?.tasks) continue
      const found = data.tasks.find(
        (t) => t.task_id === taskIdParam || t.number === Number(numMatch?.[1])
      )
      if (found) return found.id
    }

    // Already a UUID — use directly
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(taskIdParam)) return taskIdParam

    return null
  }, [taskIdParam, slug])
}