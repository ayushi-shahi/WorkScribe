// src/pages/BacklogPage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { getTasksApi, getBacklogApi, getSprintsApi, createTaskApi } from '@/api/endpoints/tasks'
import { getProjectsApi, getProjectStatusesApi } from '@/api/endpoints/projects'
import { priorityColor, statusColor, getInitials } from '@/lib/taskHelpers'
import toast from 'react-hot-toast'
import type { Task, Sprint, TaskStatus } from '@/types'
import '@/styles/backlog.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sprintDateRange(sprint: Sprint): string {
  if (!sprint.start_date && !sprint.end_date) return ''
  return `${formatDate(sprint.start_date)} – ${formatDate(sprint.end_date)}`
}

function enrichTasks(
  tasks: Task[],
  statuses: TaskStatus[],
  projectKey: string
): Task[] {
  const statusMap = new Map(statuses.map((s) => [s.id, s]))
  return tasks.map((t) => ({
    ...t,
    task_id: t.task_id || `${projectKey}-${t.number}`,
    status: t.status ?? statusMap.get(t.status_id),
  }))
}

// ── Inline create row ─────────────────────────────────────────────────────────

interface InlineCreateProps {
  projectId: string
  statusId: string
  sprintId?: string
  onCancel: () => void
}

function InlineCreateRow({ projectId, statusId, sprintId, onCancel }: InlineCreateProps) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const mutation = useMutation({
    mutationFn: () =>
      createTaskApi(slug!, projectId, {
        title:     title.trim(),
        status_id: statusId,
        sprint_id: sprintId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog', slug, projectId] })
      queryClient.invalidateQueries({ queryKey: ['backlog-tasks', slug, projectId] })
      queryClient.invalidateQueries({ queryKey: ['board', slug] })
      toast.success('Task created')
      onCancel()
    },
    onError: () => {
      toast.error('Failed to create task')
    },
  })

  const handleSubmit = () => {
    if (!title.trim() || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <div className="bl-inline-create">
      <div className="bl-inline-create-row">
        <span className="bl-priority-dot" style={{ background: 'transparent' }} />
        <input
          ref={inputRef}
          className="bl-inline-input"
          placeholder="Task title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
            if (e.key === 'Escape') onCancel()
          }}
        />
        <button
          type="button"
          className="bl-inline-submit"
          onClick={handleSubmit}
          disabled={!title.trim() || mutation.isPending}
        >
          {mutation.isPending ? '…' : 'Add'}
        </button>
        <button
          type="button"
          className="bl-inline-cancel"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task
  onClick: (task: Task) => void
}

function TaskRow({ task, onClick }: TaskRowProps) {
  const category = task.status?.category
  const isDone = category === 'done'

  return (
    <div className="bl-task-row" onClick={() => onClick(task)}>
      <span
        className="bl-priority-dot"
        style={{ background: priorityColor(task.priority) }}
      />
      <span className={`bl-task-id${isDone ? ' bl-task-id--done' : ''}`}>
        {task.task_id}
      </span>
      <span className={`bl-task-title${isDone ? ' bl-task-title--done' : ''}`}>
        {task.title}
      </span>
      <span
        className="bl-status-chip"
        style={{
          background: `${statusColor(category ?? 'todo')}20`,
          color: statusColor(category ?? 'todo'),
        }}
      >
        {task.status?.name ?? '—'}
      </span>
      {task.assignee ? (
        <span className="bl-assignee-avatar" title={task.assignee.display_name}>
          {getInitials(task.assignee.display_name)}
        </span>
      ) : (
        <span className="bl-assignee-empty" />
      )}
    </div>
  )
}

// ── Sprint section ────────────────────────────────────────────────────────────

interface SprintSectionProps {
  sprint: Sprint
  tasks: Task[]
  firstStatusId: string
  projectId: string
  onTaskClick: (task: Task) => void
}

function SprintSection({ sprint, tasks, firstStatusId, projectId, onTaskClick }: SprintSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const doneTasks  = tasks.filter((t) => t.status?.category === 'done').length
  const totalTasks = tasks.length
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const isActive   = sprint.status === 'active'

  return (
    <div className={`bl-section${isActive ? ' bl-section--active' : ''}`}>
      <div className="bl-section-header" onClick={() => setCollapsed((c) => !c)}>
        <button type="button" className="bl-collapse-btn" aria-label="Toggle section">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className={`bl-sprint-badge${isActive ? ' bl-sprint-badge--active' : ''}`}>
          {isActive ? 'Active' : 'Planned'}
        </span>
        <span className="bl-section-name">{sprint.name}</span>
        {sprintDateRange(sprint) && (
          <span className="bl-section-dates">{sprintDateRange(sprint)}</span>
        )}
        {isActive && totalTasks > 0 && (
          <div className="bl-progress-wrap">
            <div className="bl-progress-bar">
              <div className="bl-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="bl-progress-text">{doneTasks}/{totalTasks}</span>
          </div>
        )}
        <span className="bl-section-count">{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
      </div>

      {!collapsed && (
        <div className="bl-section-body">
          {tasks.length === 0 && !showCreate && (
            <div className="bl-empty-row">No tasks in this sprint</div>
          )}
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onClick={onTaskClick} />
          ))}
          {showCreate ? (
            <InlineCreateRow
              projectId={projectId}
              statusId={firstStatusId}
              sprintId={sprint.id}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <button
              type="button"
              className="bl-add-task-btn"
              onClick={(e) => { e.stopPropagation(); setShowCreate(true) }}
            >
              <Plus size={12} />
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Backlog section ───────────────────────────────────────────────────────────

interface BacklogSectionProps {
  tasks: Task[]
  firstStatusId: string
  projectId: string
  onTaskClick: (task: Task) => void
}

function BacklogSection({ tasks, firstStatusId, projectId, onTaskClick }: BacklogSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="bl-section">
      <div className="bl-section-header" onClick={() => setCollapsed((c) => !c)}>
        <button type="button" className="bl-collapse-btn" aria-label="Toggle section">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="bl-section-name">Backlog</span>
        <span className="bl-section-count">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>

      {!collapsed && (
        <div className="bl-section-body">
          {tasks.length === 0 && !showCreate && (
            <div className="bl-empty-row">No tasks in backlog</div>
          )}
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onClick={onTaskClick} />
          ))}
          {showCreate ? (
            <InlineCreateRow
              projectId={projectId}
              statusId={firstStatusId}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <button
              type="button"
              className="bl-add-task-btn"
              onClick={(e) => { e.stopPropagation(); setShowCreate(true) }}
            >
              <Plus size={12} />
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BacklogSkeleton() {
  return (
    <div className="bl-root">
      <div className="bl-header">
        <div className="skeleton" style={{ width: 120, height: 18 }} />
      </div>
      <div className="bl-content">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bl-section">
            <div className="bl-section-header">
              <div className="skeleton" style={{ width: '40%', height: 14 }} />
            </div>
            <div className="bl-section-body">
              {[1, 2].map((j) => (
                <div key={j} className="skeleton" style={{ height: 36, borderRadius: 6, margin: '2px 0' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BacklogPage ───────────────────────────────────────────────────────────────

export default function BacklogPage() {
  const { slug, key } = useParams<{ slug: string; key: string }>()
  const navigate = useNavigate()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const project = projects.find((p) => p.key === key)

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', slug, project?.id],
    queryFn: () => getProjectStatusesApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 60_000,
  })

  const firstStatusId = statuses[0]?.id ?? ''

  const { data: sprintData } = useQuery({
    queryKey: ['sprints', slug, project?.id],
    queryFn: () => getSprintsApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })
  const allSprints: Sprint[] = sprintData?.sprints ?? []
  const activeSprints  = allSprints.filter((s) => s.status === 'active')
  const plannedSprints = allSprints.filter((s) => s.status === 'planned')

  const { data: allTasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['backlog', slug, project?.id],
    queryFn: () => getTasksApi(slug ?? '', project?.id ?? '', {}, 0, 100),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const { data: backlogData } = useQuery({
    queryKey: ['backlog-tasks', slug, project?.id],
    queryFn: () => getBacklogApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const handleTaskClick = (task: Task) => {
    navigate(`/org/${slug}/projects/${key}/board?task=${task.task_id}`)
  }

  // ── Render guard ───────────────────────────────────────────────────────────

  if (!project || tasksLoading) return <BacklogSkeleton />

  // Enrich after guard so project.key is guaranteed
  const allTasks: Task[] = enrichTasks(allTasksData?.tasks ?? [], statuses, project.key)
  const backlogTasks: Task[] = enrichTasks(backlogData?.tasks ?? [], statuses, project.key)

  function getSprintTasks(sprintId: string): Task[] {
    return allTasks.filter((t) => t.sprint_id === sprintId)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bl-root">
      <div className="bl-header">
        <span className="bl-header-title">{project.name}</span>
        <div className="bl-header-divider" />
        <div className="bl-header-tabs">
          <NavLink
            to={`/org/${slug}/projects/${key}/board`}
            className={({ isActive }) => `bl-tab${isActive ? ' active' : ''}`}
          >
            Board
          </NavLink>
          <NavLink
            to={`/org/${slug}/projects/${key}/backlog`}
            className={({ isActive }) => `bl-tab${isActive ? ' active' : ''}`}
          >
            Backlog
          </NavLink>
        </div>
      </div>

      <div className="bl-content">
        {activeSprints.map((sprint) => (
          <SprintSection
            key={sprint.id}
            sprint={sprint}
            tasks={getSprintTasks(sprint.id)}
            firstStatusId={firstStatusId}
            projectId={project.id}
            onTaskClick={handleTaskClick}
          />
        ))}

        {plannedSprints.map((sprint) => (
          <SprintSection
            key={sprint.id}
            sprint={sprint}
            tasks={getSprintTasks(sprint.id)}
            firstStatusId={firstStatusId}
            projectId={project.id}
            onTaskClick={handleTaskClick}
          />
        ))}

        <BacklogSection
          tasks={backlogTasks}
          firstStatusId={firstStatusId}
          projectId={project.id}
          onTaskClick={handleTaskClick}
        />

        {activeSprints.length === 0 && plannedSprints.length === 0 && backlogTasks.length === 0 && (
          <div className="bl-empty-state">
            <p className="bl-empty-title">No tasks yet</p>
            <p className="bl-empty-sub">Create your first task to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}