import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { CheckSquare } from 'lucide-react'
import { getMyTasksApi } from '@/api/endpoints/tasks'
import { getProjectsApi, getProjectApi } from '@/api/endpoints/projects'
import { priorityColor } from '@/lib/taskHelpers'
import { formatDistanceToNow } from 'date-fns'
import type { Task } from '@/types'
import '@/styles/mywork.css'

type StatusCategory = 'all' | 'todo' | 'in_progress' | 'done'
type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low' | 'none'

const STATUS_TABS: { value: StatusCategory; label: string }[] = [
  { value: 'all',         label: 'All'         },
  { value: 'todo',        label: 'To Do'       },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done',        label: 'Done'        },
]

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all',     label: 'All priorities' },
  { value: 'urgent',  label: 'Urgent'         },
  { value: 'high',    label: 'High'           },
  { value: 'medium',  label: 'Medium'         },
  { value: 'low',     label: 'Low'            },
  { value: 'none',    label: 'No priority'    },
]

// ── Skeleton ──────────────────────────────────────────────────────────────────

function MyWorkSkeleton() {
  return (
    <div className="mw-root">
      <div className="mw-header">
        <div className="skeleton" style={{ width: 120, height: 20 }} />
        <div className="skeleton" style={{ width: 80, height: 14, marginTop: 6 }} />
      </div>
      <div className="mw-toolbar">
        <div className="skeleton" style={{ width: 320, height: 32, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: 140, height: 32, borderRadius: 8 }} />
      </div>
      <div className="mw-list">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mw-row-skeleton">
            <div className="skeleton" style={{ width: 14, height: 14, borderRadius: '50%' }} />
            <div className="skeleton" style={{ flex: 1, height: 14 }} />
            <div className="skeleton" style={{ width: 60, height: 14 }} />
            <div className="skeleton" style={{ width: 80, height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function MyWorkEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="mw-empty">
      <CheckSquare size={36} strokeWidth={1.2} className="mw-empty-icon" />
      <p className="mw-empty-title">
        {filtered ? 'No tasks match your filters' : 'No tasks assigned to you'}
      </p>
      <p className="mw-empty-sub">
        {filtered
          ? 'Try changing or clearing your filters'
          : 'Tasks assigned to you across all projects will appear here'}
      </p>
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task
  projectKey: string
  onOpen: () => void
}

function TaskRow({ task, projectKey, onOpen }: TaskRowProps) {
  const taskId = task.task_id ?? `${projectKey}-${task.number}`

  return (
    <div
      className="mw-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <span
        className="mw-priority-dot"
        style={{ background: priorityColor(task.priority) }}
        title={task.priority === 'none' ? 'No priority' : task.priority}
      />
      <span className="mw-task-id">{taskId}</span>
      <span className="mw-task-title">{task.title}</span>
      <span className={`mw-type-chip mw-type-chip--${task.type}`}>
        {task.type}
      </span>
      <span className="mw-project-key">{projectKey}</span>
      {task.labels && task.labels.length > 0 ? (
        <div className="mw-labels">
          {task.labels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              className="mw-label-chip"
              style={{
                background: l.color + '22',
                color: l.color,
                border: `1px solid ${l.color}44`,
              }}
            >
              {l.name}
            </span>
          ))}
          {task.labels.length > 2 && (
            <span className="mw-label-more">+{task.labels.length - 2}</span>
          )}
        </div>
      ) : (
        <span />
      )}
      <span className="mw-updated">
        {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
      </span>
    </div>
  )
}

// ── MyWorkPage ────────────────────────────────────────────────────────────────

export default function MyWorkPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState<StatusCategory>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')

  // ── Fetch active projects ──────────────────────────────────────────────────

  const { data: activeProjects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  // ── Fetch my tasks ─────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks', slug, statusFilter, priorityFilter],
    queryFn: () =>
      getMyTasksApi(slug ?? '', {
        status_category: statusFilter === 'all' ? undefined : statusFilter,
        priority:        priorityFilter === 'all' ? undefined : priorityFilter,
        limit: 100,
      }),
    enabled: !!slug,
    staleTime: 30_000,
  })

  const tasks = data?.tasks ?? []
  const total = data?.total ?? 0
  const isFiltered = statusFilter !== 'all' || priorityFilter !== 'all'

  // ── Build active project map ───────────────────────────────────────────────

  const activeProjectMap = useMemo(
    () => new Map(activeProjects.map((p) => [p.id, p])),
    [activeProjects]
  )

  // ── Find project IDs missing from active list (archived projects) ──────────

  const missingProjectIds = useMemo(() => {
    const seen = new Set<string>()
    for (const task of tasks) {
      if (!activeProjectMap.has(task.project_id)) {
        seen.add(task.project_id)
      }
    }
    return Array.from(seen)
  }, [tasks, activeProjectMap])

  // ── Fetch missing (archived) projects individually ─────────────────────────

  const archivedProjectQueries = useQueries({
    queries: missingProjectIds.map((projectId) => ({
      queryKey: ['project', slug, projectId],
      queryFn: () => getProjectApi(slug ?? '', projectId),
      enabled: !!slug && missingProjectIds.length > 0,
      staleTime: 120_000,
    })),
  })

  // ── Merge all projects into one map ───────────────────────────────────────

  const projectMap = useMemo(() => {
    const map = new Map(activeProjectMap)
    for (const q of archivedProjectQueries) {
      if (q.data) map.set(q.data.id, q.data)
    }
    return map
  }, [activeProjectMap, archivedProjectQueries])

  // ── Are we still loading archived project info? ───────────────────────────

  const archivedLoading = archivedProjectQueries.some((q) => q.isLoading)

  // ── Open task in board panel ───────────────────────────────────────────────

  function openTask(taskId: string, projectId: string) {
    const project = projectMap.get(projectId)
    if (!project) return
    navigate(`/org/${slug}/projects/${project.key}/board?task=${taskId}`)
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) return <MyWorkSkeleton />

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mw-root">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mw-header">
        <div className="page-header">
          <CheckSquare size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="page-header-title">My Work</span>
          {total > 0 && (
            <span className="mw-total-chip">{total}</span>
          )}
        </div>
        <p className="mw-header-sub">
          All tasks assigned to you across every project
        </p>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mw-toolbar">
        <div className="mw-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              className={`mw-tab${statusFilter === tab.value ? ' mw-tab--active' : ''}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          className="mw-priority-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Task list ───────────────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <MyWorkEmpty filtered={isFiltered} />
      ) : (
        <div className="mw-list">
          <div className="mw-list-header">
            <span className="mw-col-priority" />
            <span className="mw-col-id">ID</span>
            <span className="mw-col-title">Title</span>
            <span className="mw-col-type">Type</span>
            <span className="mw-col-project">Project</span>
            <span className="mw-col-labels">Labels</span>
            <span className="mw-col-updated">Updated</span>
          </div>

          {tasks.map((task) => {
            const project = projectMap.get(task.project_id)
            const projectKey = project?.key ?? '…'
            const taskId = task.task_id ?? `${projectKey}-${task.number}`
            return (
              <TaskRow
                key={task.id}
                task={task}
                projectKey={archivedLoading && !project ? '…' : projectKey}
                onOpen={() => openTask(taskId, task.project_id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}