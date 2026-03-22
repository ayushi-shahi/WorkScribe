// src/components/panel/TaskPanel.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ExternalLink, ChevronDown, Check, Send, Trash2, FileText, Plus, Link2, CheckSquare, Square } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { getTaskApi, updateTaskApi, getSubtasksApi, createTaskApi } from '@/api/endpoints/tasks'
import { getProjectStatusesApi } from '@/api/endpoints/projects'
import { getCommentsApi, createCommentApi, deleteCommentApi } from '@/api/endpoints/comments'
import { getTaskLinksApi, createTaskLinkApi, deleteTaskLinkApi } from '@/api/endpoints/links'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { searchApi } from '@/api/endpoints/search'
import { useAuthStore } from '@/stores/authStore'
import { priorityColor, statusColor, getInitials } from '@/lib/taskHelpers'
import type { Comment, TaskLink, Task, TaskStatus } from '@/types'
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

// ── Extract plain text from Tiptap body_json ──────────────────────────────────

function extractCommentText(body_json: { type: string; content: unknown[] }): string {
  try {
    const paragraphs = body_json.content as Array<{
      type: string
      content?: Array<{ type: string; text?: string }>
    }>
    return paragraphs
      .flatMap((p) => p.content ?? [])
      .filter((n) => n.type === 'text')
      .map((n) => n.text ?? '')
      .join('')
  } catch {
    return ''
  }
}

// ── StatusDropdown ────────────────────────────────────────────────────────────

interface StatusDropdownProps {
  currentStatusId: string
  statuses: TaskStatus[]
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
      <button className="tp-field-btn" onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled}>
        <span className="tp-status-dot" style={{ background: statusColor(current?.category ?? 'todo') }} />
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
              <span className="tp-status-dot" style={{ background: statusColor(s.category) }} />
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
        <span className="tp-priority-dot" style={{ background: priorityColor(current) }} />
        <span className="tp-field-btn-text" style={{ textTransform: 'capitalize' }}>{current}</span>
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
              <span className="tp-priority-dot" style={{ background: priorityColor(opt.value) }} />
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

function AssigneeDropdown({ currentAssigneeId, currentAssigneeName, slug, onSelect, disabled }: AssigneeDropdownProps) {
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

  const members = Array.isArray((membersData as any)?.members)
    ? (membersData as any).members
    : Array.isArray(membersData) ? membersData : []
  const filtered = members.filter((m: any) =>
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
            <span className="tp-assignee-avatar">{getInitials(currentAssigneeName ?? '?')}</span>
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
            {filtered.map((m: any) => (
              <button
                key={m.user_id}
                className={`tp-dropdown-item${m.user_id === currentAssigneeId ? ' tp-dropdown-item--active' : ''}`}
                onClick={() => handleSelect(m.user_id)}
              >
                <span className="tp-assignee-avatar">{getInitials(m.display_name)}</span>
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

// ── LinkDocModal ──────────────────────────────────────────────────────────────

interface LinkDocModalProps {
  slug: string
  taskId: string
  existingPageIds: string[]
  onClose: () => void
  onLinked: () => void
}

function LinkDocModal({ slug, taskId, existingPageIds, onClose, onLinked }: LinkDocModalProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: rawResults, isFetching } = useQuery({
    queryKey: ['search-pages', slug, debouncedQuery],
    queryFn: () => searchApi(slug, debouncedQuery, 'page'),
    enabled: debouncedQuery.length >= 1,
    staleTime: 10_000,
  })
  const results = Array.isArray(rawResults) ? rawResults : (rawResults as any)?.data ?? []
  const linkMutation = useMutation({
    mutationFn: (pageId: string) => createTaskLinkApi(taskId, pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links', taskId] })
      onLinked()
      onClose()
    },
  })

  const filtered = results.filter((r: any) => !existingPageIds.includes(r.id))

  return (
    <>
      <div className="tp-link-modal-overlay" onClick={onClose} />
      <div className="tp-link-modal">
        <div className="tp-link-modal-header">
          <span className="tp-link-modal-title">Link a document</span>
          <button className="task-panel-icon-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="tp-link-modal-search">
          <input
            ref={inputRef}
            className="tp-dropdown-search"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div className="tp-link-modal-results">
          {debouncedQuery.length === 0 && (
            <div className="tp-link-modal-empty">Type to search pages…</div>
          )}
          {debouncedQuery.length > 0 && !isFetching && filtered.length === 0 && (
            <div className="tp-link-modal-empty">No pages found</div>
          )}
          {filtered.map((r: any) => (
            <button
              key={r.id}
              className="tp-link-modal-result"
              onClick={() => linkMutation.mutate(r.id)}
              disabled={linkMutation.isPending}
            >
              <FileText size={13} className="tp-link-modal-result-icon" />
              <div className="tp-link-modal-result-info">
                <span className="tp-link-modal-result-title">{r.title}</span>
                <span className="tp-link-modal-result-sub">{r.subtitle}</span>
              </div>
              <Plus size={13} className="tp-link-modal-result-add" />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── SubtasksSection ───────────────────────────────────────────────────────────

interface SubtasksSectionProps {
  parentTaskId: string
  slug: string
  projectId: string
  statuses: TaskStatus[]
}

function SubtasksSection({ parentTaskId, slug, projectId, statuses }: SubtasksSectionProps) {
  const queryClient = useQueryClient()
  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const todoStatus = statuses.find((s) => s.category === 'todo')

  const { data, isLoading } = useQuery({
    queryKey: ['subtasks', parentTaskId],
    queryFn: () => getSubtasksApi(slug, projectId, parentTaskId),
    enabled: Boolean(slug && projectId && parentTaskId),
    staleTime: 30_000,
  })

  const subtasks: Task[] = data?.tasks ?? []

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, statusId }: { taskId: string; statusId: string }) =>
      updateTaskApi(taskId, { status_id: statusId }),
    onMutate: async ({ taskId, statusId }) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', parentTaskId] })
      const snapshot = queryClient.getQueryData<{ tasks: Task[]; total: number }>(['subtasks', parentTaskId])
      const targetStatus = statuses.find((s) => s.id === statusId)
      queryClient.setQueryData<{ tasks: Task[]; total: number }>(['subtasks', parentTaskId], (old) => {
        if (!old) return old
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            t.id !== taskId
              ? t
              : { ...t, status_id: statusId, status: targetStatus ?? t.status }
          ),
        }
      })
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['subtasks', parentTaskId], ctx.snapshot)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', parentTaskId] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      createTaskApi(slug, projectId, {
        title,
        parent_task_id: parentTaskId,
        type: 'subtask',
        status_id: todoStatus?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', parentTaskId] })
      setNewTitle('')
      setShowInput(false)
    },
  })

  useEffect(() => {
    if (showInput) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showInput])

  function handleToggle(task: Task) {
    const doneStatus = statuses.find((s) => s.category === 'done')
    const todoStatus = statuses.find((s) => s.category === 'todo')
    if (!doneStatus || !todoStatus) return
    const isDone = task.status?.category === 'done' || task.status_id === doneStatus.id
    toggleMutation.mutate({ taskId: task.id, statusId: isDone ? todoStatus.id : doneStatus.id })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && newTitle.trim()) {
      createMutation.mutate(newTitle.trim())
    } else if (e.key === 'Escape') {
      setShowInput(false)
      setNewTitle('')
    }
  }

  const doneStatusId = statuses.find((s) => s.category === 'done')?.id
  const doneCount = subtasks.filter((t) =>
    t.status?.category === 'done' || t.status_id === doneStatusId
  ).length
  const totalCount = subtasks.length

  return (
    <div>
      <div className="tp-section-header">
        <span className="task-panel-section-label" style={{ marginBottom: 0 }}>
          Subtasks{totalCount > 0 ? ` (${doneCount}/${totalCount})` : ''}
        </span>
        <button
          className="tp-section-add-btn"
          onClick={() => setShowInput((v) => !v)}
          title="Add subtask"
        >
          <Plus size={12} />
          Add subtask
        </button>
      </div>

      {totalCount > 0 && (
        <div className="tp-subtasks-progress">
          <div
            className="tp-subtasks-progress-bar"
            style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
          />
        </div>
      )}

      {isLoading && (
        <div className="tp-subtasks-loading">
          <div className="skeleton" style={{ height: 28, width: '100%', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 28, width: '80%', borderRadius: 6 }} />
        </div>
      )}

      {!isLoading && subtasks.length > 0 && (
        <div className="tp-subtasks-list">
          {subtasks.map((task) => {
            const doneStatusId = statuses.find((s) => s.category === 'done')?.id
            const isDone = task.status?.category === 'done' || task.status_id === doneStatusId
            return (
              <div key={task.id} className={`tp-subtask-row${isDone ? ' tp-subtask-row--done' : ''}`}>
                <button
                  type="button"
                  className="tp-subtask-check"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggle(task) }}
                  disabled={toggleMutation.isPending}
                  title={isDone ? 'Mark incomplete' : 'Mark complete'}
                >
                  {isDone
                    ? <CheckSquare size={15} className="tp-subtask-check-icon tp-subtask-check-icon--done" />
                    : <Square size={15} className="tp-subtask-check-icon" />
                  }
                </button>
                <span className="tp-subtask-id">{task.task_id}</span>
                <span className="tp-subtask-title">{task.title}</span>
                {task.assignee && (
                  <span className="tp-subtask-assignee" title={task.assignee.display_name}>
                    {getInitials(task.assignee.display_name)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && subtasks.length === 0 && !showInput && (
        <div className="tp-subtasks-empty">No subtasks yet</div>
      )}

      {showInput && (
        <div className="tp-subtask-input-row">
          <Square size={15} className="tp-subtask-check-icon tp-subtask-input-icon" />
          <input
            ref={inputRef}
            className="tp-subtask-input"
            placeholder="Subtask title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={createMutation.isPending}
          />
          <button
            className="tp-subtask-input-save"
            onClick={() => newTitle.trim() && createMutation.mutate(newTitle.trim())}
            disabled={!newTitle.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? '…' : 'Add'}
          </button>
          <button
            className="tp-subtask-input-cancel"
            onClick={() => { setShowInput(false); setNewTitle('') }}
          >
            <X size={13} />
          </button>
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
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
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
  const comments: Comment[] = commentData?.comments ?? []

  const { data: links = [] } = useQuery({
    queryKey: ['links', resolvedId],
    queryFn: () => getTaskLinksApi(resolvedId!),
    enabled: !!resolvedId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (task) setTitle(task.title)
  }, [task?.id])

  // ── Title autosave ────────────────────────────────────────────────────────
  const titleMutation = useMutation({
    mutationFn: (newTitle: string) => updateTaskApi(resolvedId!, { title: newTitle }),
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
    mutationFn: (statusId: string) => updateTaskApi(resolvedId!, { status_id: statusId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Priority mutation ─────────────────────────────────────────────────────
  const priorityMutation = useMutation({
    mutationFn: (priority: PriorityValue) => updateTaskApi(resolvedId!, { priority }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Assignee mutation ─────────────────────────────────────────────────────
  const assigneeMutation = useMutation({
    mutationFn: (assigneeId: string | null) => updateTaskApi(resolvedId!, { assignee_id: assigneeId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
    },
  })

  // ── Description editor ────────────────────────────────────────────────────
  const DRAFT_KEY = `task-desc-draft:${resolvedId}`

  const descMutation = useMutation({
    mutationFn: (json: Record<string, unknown>) => updateTaskApi(resolvedId!, { description_json: json }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      localStorage.removeItem(DRAFT_KEY)
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedDescSave = useCallback(
    debounce((json: Record<string, unknown>) => { descMutation.mutate(json) }, 1500),
    [resolvedId]
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Add a description…' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'tp-editor-content', spellcheck: 'false' } },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as Record<string, unknown>
      localStorage.setItem(DRAFT_KEY, JSON.stringify(json))
      debouncedDescSave(json)
    },
  })

  useEffect(() => {
    if (!editor || !task) return
    const draft = localStorage.getItem(DRAFT_KEY)
    const content = draft ? JSON.parse(draft) : (task.description_json ?? '')
    editor.commands.setContent(content ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, editor])

  // ── Comment submit ────────────────────────────────────────────────────────
  const commentMutation = useMutation({
    mutationFn: (text: string) => createCommentApi(resolvedId!, text),
    onMutate: async (text: string) => {
      await queryClient.cancelQueries({ queryKey: ['comments', resolvedId] })
      const previous = queryClient.getQueryData<{ comments: Comment[]; total: number }>(['comments', resolvedId])
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        task_id: resolvedId!,
        author_id: user?.id ?? '',
        author: {
          id: user?.id ?? '',
          display_name: user?.display_name ?? '',
          email: user?.email ?? '',
          avatar_url: null,
        },
        body_json: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      queryClient.setQueryData(['comments', resolvedId], {
        comments: [...(previous?.comments ?? []), optimistic],
        total: (previous?.total ?? 0) + 1,
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['comments', resolvedId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', resolvedId] })
    },
  })

  function submitComment() {
    const text = comment.trim()
    if (!text || commentMutation.isPending) return
    setComment('')
    commentMutation.mutate(text)
  }

  // ── Comment delete ────────────────────────────────────────────────────────
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteCommentApi(resolvedId!, commentId),
    onMutate: async (commentId) => {
      setDeletingCommentId(commentId)
      await queryClient.cancelQueries({ queryKey: ['comments', resolvedId] })
      const previous = queryClient.getQueryData<{ comments: Comment[]; total: number }>(['comments', resolvedId])
      queryClient.setQueryData(['comments', resolvedId], {
        comments: (previous?.comments ?? []).filter((c) => c.id !== commentId),
        total: Math.max((previous?.total ?? 1) - 1, 0),
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['comments', resolvedId], context.previous)
    },
    onSettled: () => {
      setDeletingCommentId(null)
      queryClient.invalidateQueries({ queryKey: ['comments', resolvedId] })
    },
  })

  // ── Unlink doc ────────────────────────────────────────────────────────────
  const unlinkMutation = useMutation({
    mutationFn: (pageId: string) => deleteTaskLinkApi(resolvedId!, pageId),
    onMutate: async (pageId) => {
      await queryClient.cancelQueries({ queryKey: ['links', resolvedId] })
      const previous = queryClient.getQueryData<TaskLink[]>(['links', resolvedId])
      queryClient.setQueryData(['links', resolvedId], (previous ?? []).filter((l) => l.page_id !== pageId))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['links', resolvedId], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['links', resolvedId] })
    },
  })

  // ── Close ─────────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams)
    params.delete('task')
    navigate({ search: params.toString() }, { replace: true })
  }, [navigate, searchParams])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showLinkModal) close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close, showLinkModal])

  if (!taskIdParam) return null

  return (
    <>
      <div className="task-panel-overlay" onClick={close} />

      <div className="task-panel" role="dialog" aria-modal="true">
        {/* Topbar */}
        <div className="task-panel-topbar">
          <span className="task-panel-id">{task?.task_id ?? taskIdParam}</span>
          <div className="task-panel-spacer" />
          <button className="task-panel-icon-btn" title="Open full page" onClick={() => alert('Full page view — coming soon')}>
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
              <span className="task-meta-label">Status</span>
              <div className="task-meta-value">
                <StatusDropdown
                  currentStatusId={task.status_id}
                  statuses={statuses}
                  onSelect={(id) => statusMutation.mutate(id)}
                  disabled={statusMutation.isPending}
                />
              </div>

              <span className="task-meta-label">Priority</span>
              <div className="task-meta-value">
                <PriorityDropdown
                  current={(task.priority as PriorityValue) ?? 'none'}
                  onSelect={(p) => priorityMutation.mutate(p)}
                  disabled={priorityMutation.isPending}
                />
              </div>

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

              <span className="task-meta-label">Type</span>
              <div className="task-meta-value">
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)', textTransform: 'capitalize', paddingLeft: 8 }}>
                  {task.type ?? 'task'}
                </span>
              </div>

              {task.due_date && (
                <>
                  <span className="task-meta-label">Due date</span>
                  <div className="task-meta-value">
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)', paddingLeft: 8 }}>
                      {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </>
              )}

              {task.labels.length > 0 && (
                <>
                  <span className="task-meta-label">Labels</span>
                  <div className="task-meta-value" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {task.labels.map((label) => (
                      <span key={label.id} className="task-label-chip">{label.name}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="task-panel-divider" />

            {/* Description */}
            <div>
              <div className="tp-editor-header">
                <span className="task-panel-section-label" style={{ marginBottom: 0 }}>Description</span>
                {editor && (
                  <div className="tp-editor-toolbar">
                    <button type="button" className={`tp-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} title="Bold"><strong>B</strong></button>
                    <button type="button" className={`tp-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} title="Italic"><em>I</em></button>
                    <button type="button" className={`tp-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }} title="Bullet list">•–</button>
                    <button type="button" className={`tp-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }} title="Numbered list">1.</button>
                    <span className="tp-editor-save-status">{descMutation.isPending ? 'Saving…' : descMutation.isSuccess ? 'Saved' : ''}</span>
                  </div>
                )}
              </div>
              <EditorContent editor={editor} className="tp-editor-wrap" />
            </div>

            <div className="task-panel-divider" />

            {/* Subtasks */}
            <SubtasksSection
              parentTaskId={resolvedId!}
              slug={slug ?? ''}
              projectId={task.project_id}
              statuses={statuses}
            />

            <div className="task-panel-divider" />

            {/* Linked Docs */}
            <div>
              <div className="tp-section-header">
                <span className="task-panel-section-label" style={{ marginBottom: 0 }}>
                  Linked Docs {links.length > 0 && `(${links.length})`}
                </span>
                <button
                  className="tp-section-add-btn"
                  onClick={() => setShowLinkModal(true)}
                  title="Link a document"
                >
                  <Link2 size={12} />
                  Link doc
                </button>
              </div>

              {links.length > 0 && (
                <div className="tp-links-list">
                  {links.map((link) => (
                    <div key={link.page_id} className="tp-link-item">
                      <FileText size={13} className="tp-link-icon" />
                      <div className="tp-link-info">
                        <span className="tp-link-title">{link.page_title}</span>
                        <span className="tp-link-space">{link.space_name}</span>
                      </div>
                      <button
                        className="tp-link-remove-btn"
                        title="Remove link"
                        onClick={() => unlinkMutation.mutate(link.page_id)}
                        disabled={unlinkMutation.isPending}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {links.length === 0 && (
                <div className="tp-links-empty">No linked documents</div>
              )}
            </div>

            <div className="task-panel-divider" />

            {/* Comments */}
            <div>
              <div className="task-panel-section-label">
                Comments {comments.length > 0 && `(${comments.length})`}
              </div>

              {comments.length > 0 && (
                <div className="tp-comments-list">
                  {comments.map((c) => {
                    const isOwn = c.author_id === user?.id
                    const isDeleting = deletingCommentId === c.id
                    const isOptimistic = c.id.startsWith('optimistic-')
                    return (
                      <div key={c.id} className={`task-comment${isOptimistic ? ' task-comment--optimistic' : ''}`}>
                        <div className="avatar avatar-xs">{getInitials(c.author.display_name)}</div>
                        <div className="task-comment-body">
                          <div className="task-comment-header">
                            <span className="task-comment-author">{c.author.display_name}</span>
                            <span className="task-comment-time">
                              {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <div className="task-comment-actions">
                              {isOwn && !isOptimistic && (
                                <button
                                  className="task-comment-delete-btn"
                                  title="Delete comment"
                                  disabled={isDeleting}
                                  onClick={() => deleteCommentMutation.mutate(c.id)}
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="task-comment-text">{extractCommentText(c.body_json)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="task-comment-input-row">
                {user && (
                  <div className="avatar avatar-xs" style={{ marginTop: 3 }}>
                    {getInitials(user.display_name)}
                  </div>
                )}
                <textarea
                  ref={commentInputRef}
                  className="task-comment-input"
                  placeholder="Add a comment… (Cmd+Enter to submit)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      submitComment()
                    }
                  }}
                  rows={1}
                />
                <button
                  className="task-comment-submit"
                  disabled={!comment.trim() || commentMutation.isPending}
                  onClick={submitComment}
                  title="Submit (Cmd+Enter)"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>

            <div className="task-panel-divider" />

            {/* Activity */}
            <ActivitySection taskId={resolvedId!} statuses={statuses} slug={slug ?? ''} />
          </div>
        )}
      </div>

      {showLinkModal && resolvedId && (
        <LinkDocModal
          slug={slug ?? ''}
          taskId={resolvedId}
          existingPageIds={links.map((l) => l.page_id)}
          onClose={() => setShowLinkModal(false)}
          onLinked={() => queryClient.invalidateQueries({ queryKey: ['links', resolvedId] })}
        />
      )}
    </>
  )
}

// ── ActivitySection ───────────────────────────────────────────────────────────

import { getActivityApi } from '@/api/endpoints/activity'

interface ActivityEntry {
  id: string
  actor: { display_name: string }
  action: string
  field_name: string | null
  old_value: unknown
  new_value: unknown
  created_at: string
}

interface SprintSummary {
  id: string
  name: string
}

function ActivitySection({
  taskId,
  statuses,
  slug,
}: {
  taskId: string
  statuses: TaskStatus[]
  slug: string
}) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['activity', taskId],
    queryFn: () => getActivityApi(taskId),
    enabled: !!taskId,
    staleTime: 30_000,
  })

  const { data: membersData } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug),
    enabled: !!slug,
    staleTime: 60_000,
  })

  // ── Resolve sprint names from cache (populated by BacklogPage) ────────────
  const sprintQueries = queryClient.getQueriesData<{ sprints: SprintSummary[] }>({
    queryKey: ['sprints'],
  })
  const allSprints: SprintSummary[] = sprintQueries.flatMap(([, data]) => data?.sprints ?? [])

  const members = Array.isArray((membersData as any)?.members)
    ? (membersData as any).members
    : Array.isArray(membersData) ? membersData : []
  const entries: ActivityEntry[] = data?.activities ?? []

  if (entries.length === 0) return null

  return (
    <div>
      <div className="task-panel-section-label">Activity</div>
      <div className="tp-activity-list">
        {entries.map((entry) => (
          <div key={entry.id} className="tp-activity-item">
            <div className="avatar avatar-xs" style={{ flexShrink: 0 }}>
              {getInitials(entry.actor.display_name)}
            </div>
            <div className="tp-activity-content">
              <span className="tp-activity-actor">{entry.actor.display_name}</span>
              {' '}
              <span className="tp-activity-text">
                {formatActivity(entry, statuses, members, allSprints)}
              </span>
              <div className="tp-activity-time">
                {new Date(entry.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatActivity(
  entry: ActivityEntry,
  statuses: TaskStatus[],
  members: import('@/types').OrgMember[],
  sprints: SprintSummary[] = [],
): string {
  const action = entry.action

  if (action === 'TASK_CREATED') {
    const nv = entry.new_value as Record<string, unknown> | null
    const title = nv?.title ? `"${String(nv.title)}"` : 'this task'
    return `created task ${title}`
  }

  if (action === 'FIELD_UPDATED') {
    const nv = entry.new_value as Record<string, unknown> | null
    const ov = entry.old_value as Record<string, unknown> | null
    if (!nv) return 'updated this task'

    const field = Object.keys(nv)[0]
    if (!field) return 'updated this task'

    const newRaw = nv[field]
    const oldRaw = ov?.[field]

    const fieldLabels: Record<string, string> = {
      priority:    'priority',
      status_id:   'status',
      assignee_id: 'assignee',
      title:       'title',
      sprint_id:   'sprint',
      due_date:    'due date',
      type:        'type',
    }
    const fieldLabel = fieldLabels[field] ?? field.replace(/_/g, ' ')

    const resolve = (val: unknown): string => {
      if (val === null || val === undefined || val === 'null') {
        if (field === 'sprint_id') return 'backlog'
        return 'none'
      }
      const str = String(val)
      if (field === 'status_id') {
        const found = statuses.find((s) => s.id === str)
        return found ? found.name : str
      }
      if (field === 'assignee_id') {
        const found = members.find((m) => m.user_id === str)
        return found ? found.display_name : str
      }
      if (field === 'sprint_id') {
        const found = sprints.find((s) => s.id === str)
        return found ? `"${found.name}"` : 'a sprint'
      }
      return str
    }

    const newVal = resolve(newRaw)
    const oldVal = oldRaw !== undefined ? resolve(oldRaw) : null

    // Special case: moved to backlog
    if (field === 'sprint_id' && newVal === 'backlog') {
      return `moved task to backlog`
    }

    if (oldVal && oldVal !== 'none' && oldVal !== 'backlog') {
      return `changed ${fieldLabel} from "${oldVal}" to "${newVal}"`
    }
    return `set ${fieldLabel} to ${newVal}`
  }

  if (action === 'COMMENT_ADDED') return 'added a comment'
  if (action === 'LINK_ADDED')    return 'linked a document'
  if (action === 'LINK_REMOVED')  return 'removed a linked document'

  return action.toLowerCase().replace(/_/g, ' ')
}

// ── Hook: resolve "APP-1" → uuid ──────────────────────────────────────────────

function useResolveTaskId(taskIdParam: string | null, slug: string | undefined): string | null {
  const queryClient = useQueryClient()

  return useMemo(() => {
    if (!taskIdParam) return null

    const boardQueries = queryClient.getQueriesData<{ tasks: Task[] }>({ queryKey: ['board', slug] })
    for (const [, data] of boardQueries) {
      if (!data?.tasks) continue
      const found = data.tasks.find((t) => t.task_id === taskIdParam)
      if (found) return found.id
    }

    const numMatch = taskIdParam.match(/-(\d+)$/)
    if (numMatch) {
      const num = parseInt(numMatch[1], 10)
      for (const [, data] of boardQueries) {
        if (!data?.tasks) continue
        const found = data.tasks.find((t) => t.number === num)
        if (found) return found.id
      }
    }

    const backlogQueries = queryClient.getQueriesData<{ tasks: Task[] }>({ queryKey: ['backlog-tasks', slug] })
    for (const [, data] of backlogQueries) {
      if (!data?.tasks) continue
      const found = data.tasks.find((t) => t.task_id === taskIdParam || t.number === Number(numMatch?.[1]))
      if (found) return found.id
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(taskIdParam)) return taskIdParam

    return null
  }, [taskIdParam, slug])
}