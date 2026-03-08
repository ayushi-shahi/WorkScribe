import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ExternalLink, Trash2, Send } from 'lucide-react'
import { getTaskApi, updateTaskApi } from '@/api/endpoints/tasks'
import { getProjectStatusesApi } from '@/api/endpoints/projects'
import { getCommentsApi, createCommentApi } from '@/api/endpoints/comments'
import { useAuthStore } from '@/stores/authStore'
import { priorityColor, statusColor, getInitials } from '@/lib/taskHelpers'
import '@/styles/taskPanel.css'

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low', 'none'] as const

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function TaskPanel() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const taskIdParam = searchParams.get('task') // e.g. "APP-1"

  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const debouncedTitle = useDebounce(title, 600)

  // ── Fetch task by task_id string (APP-1) ──────────────────────────────────
  // First resolve task_id → uuid via the tasks list already in cache
  const resolvedId = useResolveTaskId(taskIdParam, slug)

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', resolvedId],
    queryFn: () => getTaskApi(resolvedId!),
    enabled: !!resolvedId,
    staleTime: 30_000,
  })

  // ── Statuses ──────────────────────────────────────────────────────────────
  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses', slug, task?.project_id],
    queryFn: () => getProjectStatusesApi(slug ?? '', task?.project_id ?? ''),
    enabled: !!slug && !!task?.project_id,
    staleTime: 60_000,
  })

  // ── Comments ──────────────────────────────────────────────────────────────
  const { data: commentData } = useQuery({
    queryKey: ['comments', resolvedId],
    queryFn: () => getCommentsApi(resolvedId!),
    enabled: !!resolvedId,
    staleTime: 30_000,
  })
  const comments = commentData?.comments ?? []

  // ── Sync local title with fetched task ────────────────────────────────────
  useEffect(() => {
    if (task) setTitle(task.title)
  }, [task?.id])

  // ── Auto-save title ───────────────────────────────────────────────────────
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

  // ── Status update ─────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: (statusId: string) =>
      updateTaskApi(resolvedId!, { status_id: statusId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
  })

  // ── Priority update ───────────────────────────────────────────────────────
  const priorityMutation = useMutation({
    mutationFn: (priority: typeof PRIORITY_OPTIONS[number]) =>
      updateTaskApi(resolvedId!, { priority }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', resolvedId], updated)
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
  })

  // ── Comment submit ────────────────────────────────────────────────────────
  const commentMutation = useMutation({
    mutationFn: () => createCommentApi(resolvedId!, comment.trim()),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['comments', resolvedId] })
    },
  })

  // ── Close panel ───────────────────────────────────────────────────────────
  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams)
    params.delete('task')
    navigate({ search: params.toString() }, { replace: true })
  }, [navigate, searchParams])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  if (!taskIdParam) return null

  const currentStatus = statuses.find((s) => s.id === task?.status_id)

  return (
    <>
      {/* Overlay */}
      <div className="task-panel-overlay" onClick={close} />

      {/* Panel */}
      <div className="task-panel" role="dialog" aria-modal="true">
        {/* ── Topbar ────────────────────────────────────────── */}
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
          <button
            className="task-panel-icon-btn"
            title="Close"
            onClick={close}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
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
            {/* ── Title ───────────────────────────────────── */}
            <textarea
              ref={titleRef}
              className="task-panel-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                // Auto resize
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              rows={1}
              spellCheck={false}
            />

            {/* ── Meta grid ───────────────────────────────── */}
            <div className="task-panel-meta">
              {/* Status */}
              <span className="task-meta-label">Status</span>
              <div className="task-meta-value">
                <button
                  className="status-chip"
                  onClick={() => {
                    const idx = statuses.findIndex((s) => s.id === task.status_id)
                    const next = statuses[(idx + 1) % statuses.length]
                    if (next) statusMutation.mutate(next.id)
                  }}
                  title="Click to advance status"
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: statusColor(currentStatus?.category ?? 'todo'),
                      flexShrink: 0,
                    }}
                  />
                  {currentStatus?.name ?? '—'}
                </button>
              </div>

              {/* Priority */}
              <span className="task-meta-label">Priority</span>
              <div className="task-meta-value">
                <button
                  className={`priority-badge ${task.priority ?? 'none'}`}
                  onClick={() => {
                    const idx = PRIORITY_OPTIONS.indexOf(task.priority as typeof PRIORITY_OPTIONS[number])
                    const next = PRIORITY_OPTIONS[(idx + 1) % PRIORITY_OPTIONS.length]
                    priorityMutation.mutate(next)
                  }}
                  title="Click to cycle priority"
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: priorityColor(task.priority),
                      flexShrink: 0,
                    }}
                  />
                  {task.priority ?? 'none'}
                </button>
              </div>

              {/* Assignee */}
              <span className="task-meta-label">Assignee</span>
              <div className="task-meta-value">
                {task.assignee ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="avatar avatar-xs">
                      {getInitials(task.assignee.display_name)}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                      {task.assignee.display_name}
                    </span>
                  </div>
                ) : (
                  <button className="task-meta-btn">Unassigned</button>
                )}
              </div>

              {/* Type */}
              <span className="task-meta-label">Type</span>
              <div className="task-meta-value">
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)', textTransform: 'capitalize' }}>
                  {task.type ?? 'task'}
                </span>
              </div>

              {/* Due date */}
              {task.due_date && (
                <>
                  <span className="task-meta-label">Due date</span>
                  <div className="task-meta-value">
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>
                      {new Date(task.due_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
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

            {/* ── Description ─────────────────────────────── */}
            <div>
              <div className="task-panel-section-label">Description</div>
              <div className="task-desc-placeholder">
                {task.description_json
                  ? 'Rich text editor coming soon…'
                  : 'Add a description…'}
              </div>
            </div>

            <div className="task-panel-divider" />

            {/* ── Comments ────────────────────────────────── */}
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
                            month: 'short', day: 'numeric'
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

// ── Hook: resolve "APP-1" string → uuid from cache ────────────────────────────
function useResolveTaskId(
  taskIdParam: string | null,
  slug: string | undefined
): string | null {
  const queryClient = useQueryClient()
  if (!taskIdParam) return null

  // Search all board query caches
  const queries = queryClient.getQueriesData<{ tasks: import('@/types').Task[] }>({
    queryKey: ['board', slug],
  })

  for (const [, data] of queries) {
    if (!data) continue
    const found = data.tasks.find((t) => t.task_id === taskIdParam)
    if (found) return found.id
  }

  return null
}