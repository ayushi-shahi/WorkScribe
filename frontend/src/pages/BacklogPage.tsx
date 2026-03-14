// src/pages/BacklogPage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getTasksApi,
  getBacklogApi,
  getSprintsApi,
  createTaskApi,
  bulkUpdatePositionsApi,
  addTaskToSprintApi,
  removeTaskFromSprintApi,
} from '@/api/endpoints/tasks'
import { getProjectsApi, getProjectStatusesApi } from '@/api/endpoints/projects'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import BacklogTaskRow from '@/components/backlog/BacklogTaskRow'
import CreateSprintModal from '@/components/backlog/CreateSprintModal'
import StartSprintModal from '@/components/backlog/StartSprintModal'
import CompleteSprintModal from '@/components/backlog/CompleteSprintModal'
import toast from 'react-hot-toast'
import type { Task, Sprint, TaskStatus } from '@/types'
import '@/styles/backlog.css'

// ── Section IDs ───────────────────────────────────────────────────────────────

function sprintDropId(sprintId: string) { return `sprint:${sprintId}` }
const BACKLOG_DROP_ID = 'backlog'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sprintDateRange(sprint: Sprint): string {
  if (!sprint.start_date && !sprint.end_date) return ''
  return `${formatDate(sprint.start_date)} – ${formatDate(sprint.end_date)}`
}

function enrichTasks(tasks: Task[], statuses: TaskStatus[], projectKey: string): Task[] {
  const statusMap = new Map(statuses.map((s) => [s.id, s]))
  return tasks.map((t) => ({
    ...t,
    task_id: t.task_id || `${projectKey}-${t.number}`,
    status: t.status ?? statusMap.get(t.status_id),
  }))
}

// ── Sortable task row wrapper ─────────────────────────────────────────────────

interface SortableBacklogRowProps {
  task: Task
  sprint?: Sprint
  onClick: (task: Task) => void
}

function SortableBacklogRow({ task, sprint, onClick }: SortableBacklogRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BacklogTaskRow task={task} sprint={sprint} onClick={onClick} />
    </div>
  )
}

// ── Droppable section body ────────────────────────────────────────────────────

interface DroppableSectionBodyProps {
  dropId: string
  tasks: Task[]
  children: React.ReactNode
}

function DroppableSectionBody({ dropId, tasks, children }: DroppableSectionBodyProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId })

  return (
    <div
      ref={setNodeRef}
      className={`bl-section-body${isOver ? ' bl-section-body--over' : ''}`}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </div>
  )
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
    onError: () => toast.error('Failed to create task'),
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

// ── Sprint section ────────────────────────────────────────────────────────────

interface SprintSectionProps {
  sprint: Sprint
  tasks: Task[]
  firstStatusId: string
  projectId: string
  plannedSprints: Sprint[]
  canManage: boolean
  onTaskClick: (task: Task) => void
}

function SprintSection({
  sprint,
  tasks,
  firstStatusId,
  projectId,
  plannedSprints,
  canManage,
  onTaskClick,
}: SprintSectionProps) {
  const [collapsed, setCollapsed]       = useState(false)
  const [showCreate, setShowCreate]     = useState(false)
  const [showStart, setShowStart]       = useState(false)
  const [showComplete, setShowComplete] = useState(false)

  const doneTasks       = tasks.filter((t) => t.status?.category === 'done').length
  const incompleteTasks = tasks.filter((t) => t.status?.category !== 'done').length
  const totalTasks      = tasks.length
  const progress        = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const isActive        = sprint.status === 'active'

  return (
    <>
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

          {/* Sprint actions — owner/admin only */}
          {canManage && (
            <div className="bl-section-actions" onClick={(e) => e.stopPropagation()}>
              {isActive ? (
                <button
                  type="button"
                  className="bl-sprint-action-btn bl-sprint-action-btn--complete"
                  onClick={() => setShowComplete(true)}
                >
                  Complete Sprint
                </button>
              ) : (
                <button
                  type="button"
                  className="bl-sprint-action-btn bl-sprint-action-btn--start"
                  onClick={() => setShowStart(true)}
                >
                  Start Sprint
                </button>
              )}
            </div>
          )}
        </div>

        {!collapsed && (
          <DroppableSectionBody dropId={sprintDropId(sprint.id)} tasks={tasks}>
            {tasks.length === 0 && !showCreate && (
              <div className="bl-empty-row">No tasks in this sprint</div>
            )}
            {tasks.map((task) => (
              <SortableBacklogRow
                key={task.id}
                task={task}
                onClick={onTaskClick}
              />
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
          </DroppableSectionBody>
        )}
      </div>

      {showStart && canManage && (
        <StartSprintModal
          sprint={sprint}
          taskCount={totalTasks}
          onClose={() => setShowStart(false)}
        />
      )}

      {showComplete && canManage && (
        <CompleteSprintModal
          sprint={sprint}
          incompleteTasks={incompleteTasks}
          plannedSprints={plannedSprints}
          onClose={() => setShowComplete(false)}
        />
      )}
    </>
  )
}

// ── Backlog section ───────────────────────────────────────────────────────────

interface BacklogSectionProps {
  tasks: Task[]
  firstStatusId: string
  projectId: string
  sprints: Sprint[]
  onTaskClick: (task: Task) => void
}

function BacklogSection({ tasks, firstStatusId, projectId, sprints, onTaskClick }: BacklogSectionProps) {
  const [collapsed, setCollapsed]   = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const sprintMap = new Map(sprints.map((s) => [s.id, s]))

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
        <DroppableSectionBody dropId={BACKLOG_DROP_ID} tasks={tasks}>
          {tasks.length === 0 && !showCreate && (
            <div className="bl-empty-row">No tasks in backlog</div>
          )}
          {tasks.map((task) => (
            <SortableBacklogRow
              key={task.id}
              task={task}
              sprint={task.sprint_id ? sprintMap.get(task.sprint_id) : undefined}
              onClick={onTaskClick}
            />
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
        </DroppableSectionBody>
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
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [activeTask, setActiveTask]             = useState<Task | null>(null)
  const [showCreateSprint, setShowCreateSprint] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── Queries ────────────────────────────────────────────────────────────────

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
  const allSprints: Sprint[]  = sprintData?.sprints ?? []
  const activeSprints         = allSprints.filter((s) => s.status === 'active')
  const plannedSprints        = allSprints.filter((s) => s.status === 'planned')

  // ── Role check ─────────────────────────────────────────────────────────────

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

  const currentMember  = members.find((m: any) => m.user_id === currentUser?.id)
  const currentRole    = currentMember?.role ?? 'member'
  const canManage      = currentRole === 'owner' || currentRole === 'admin'

  // ── Task queries ───────────────────────────────────────────────────────────

  const allTasksKey     = ['backlog', slug, project?.id]
  const backlogTasksKey = ['backlog-tasks', slug, project?.id]

  const { data: allTasksData, isLoading: tasksLoading } = useQuery({
    queryKey: allTasksKey,
    queryFn: () => getTasksApi(slug ?? '', project?.id ?? '', {}, 0, 100),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const { data: backlogData } = useQuery({
    queryKey: backlogTasksKey,
    queryFn: () => getBacklogApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const handleTaskClick = (task: Task) => {
    navigate(`/org/${slug}/projects/${key}/board?task=${task.task_id}`)
  }

  // ── Render guard ───────────────────────────────────────────────────────────

  if (!project || tasksLoading) return <BacklogSkeleton />

  const allTasks: Task[]     = enrichTasks(allTasksData?.tasks ?? [], statuses, project.key)
    .filter((t) => t.type !== 'subtask')
  const backlogTasks: Task[] = enrichTasks(backlogData?.tasks ?? [], statuses, project.key)
    .filter((t) => t.type !== 'subtask')

  function getSprintTasks(sprintId: string): Task[] {
    return allTasks.filter((t) => t.sprint_id === sprintId)
  }

  function getSectionId(taskId: string): string {
    for (const sprint of allSprints) {
      if (getSprintTasks(sprint.id).some((t) => t.id === taskId)) {
        return sprintDropId(sprint.id)
      }
    }
    return BACKLOG_DROP_ID
  }

  function getSprintIdFromDropId(dropId: string): string | null {
    if (dropId === BACKLOG_DROP_ID) return null
    if (dropId.startsWith('sprint:')) return dropId.slice(7)
    const sectionId = getSectionId(dropId)
    if (sectionId === BACKLOG_DROP_ID) return null
    return sectionId.slice(7)
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function onDragStart({ active }: DragStartEvent) {
    const task = allTasks.find((t) => t.id === active.id) ??
                 backlogTasks.find((t) => t.id === active.id) ?? null
    setActiveTask(task)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId   = String(over.id)

    const sourceSectionId = getSectionId(activeId)
    let destSectionId: string
    if (overId === BACKLOG_DROP_ID || overId.startsWith('sprint:')) {
      destSectionId = overId
    } else {
      destSectionId = getSectionId(overId)
    }

    const sourceSprintId = getSprintIdFromDropId(sourceSectionId)
    const destSprintId   = getSprintIdFromDropId(destSectionId)
    const isCrossSection = sourceSectionId !== destSectionId

    if (isCrossSection) {
      const snapshot = {
        all:     queryClient.getQueryData<{ tasks: Task[]; total: number }>(allTasksKey),
        backlog: queryClient.getQueryData<{ tasks: Task[]; total: number }>(backlogTasksKey),
      }

      const applyOptimistic = (old: { tasks: Task[]; total: number } | undefined) => {
        if (!old) return old
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            t.id === activeId ? { ...t, sprint_id: destSprintId } : t
          ),
        }
      }

      queryClient.setQueryData(allTasksKey, applyOptimistic)
      queryClient.setQueryData(backlogTasksKey, (old: { tasks: Task[]; total: number } | undefined) => {
        if (!old) return old
        if (destSprintId) {
          return { ...old, tasks: old.tasks.filter((t) => t.id !== activeId) }
        } else {
          const movedTask = allTasks.find((t) => t.id === activeId)
          if (!movedTask) return old
          return { ...old, tasks: [...old.tasks, { ...movedTask, sprint_id: null }] }
        }
      })

      try {
        if (destSprintId) {
          await addTaskToSprintApi(destSprintId, activeId)
        } else if (sourceSprintId) {
          await removeTaskFromSprintApi(sourceSprintId, activeId)
        }
        queryClient.invalidateQueries({ queryKey: ['backlog', slug, project.id] })
        queryClient.invalidateQueries({ queryKey: ['backlog-tasks', slug, project.id] })
        queryClient.invalidateQueries({ queryKey: ['board', slug] })
      } catch {
        queryClient.setQueryData(allTasksKey, snapshot.all)
        queryClient.setQueryData(backlogTasksKey, snapshot.backlog)
        toast.error('Failed to move task')
      }
    } else {
      const isBacklog    = destSectionId === BACKLOG_DROP_ID
      const sectionTasks = isBacklog
        ? [...backlogTasks]
        : [...getSprintTasks(destSprintId ?? '')]

      const oldIndex = sectionTasks.findIndex((t) => t.id === activeId)
      const newIndex = sectionTasks.findIndex((t) => t.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(sectionTasks, oldIndex, newIndex)
      const cacheKey  = isBacklog ? backlogTasksKey : allTasksKey
      const snapshot  = queryClient.getQueryData<{ tasks: Task[]; total: number }>(cacheKey)

      queryClient.setQueryData<{ tasks: Task[]; total: number }>(cacheKey, (old) => {
        if (!old) return old
        const updatedPositions = reordered.map((t, i) => ({ ...t, position: i }))
        return {
          ...old,
          tasks: old.tasks.map((t) => updatedPositions.find((u) => u.id === t.id) ?? t),
        }
      })

      try {
        await bulkUpdatePositionsApi(
          reordered.map((t, i) => ({ task_id: t.id, position: i }))
        )
      } catch {
        queryClient.setQueryData(cacheKey, snapshot)
        toast.error('Failed to reorder tasks')
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
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

          {/* New Sprint — owner/admin only */}
          {canManage && (
            <div className="bl-header-actions">
              <button
                type="button"
                className="bl-new-sprint-btn"
                onClick={() => setShowCreateSprint(true)}
              >
                <Plus size={13} />
                New Sprint
              </button>
            </div>
          )}
        </div>

        <div className="bl-content">
          {activeSprints.map((sprint) => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              tasks={getSprintTasks(sprint.id)}
              firstStatusId={firstStatusId}
              projectId={project.id}
              plannedSprints={plannedSprints}
              canManage={canManage}
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
              plannedSprints={plannedSprints}
              canManage={canManage}
              onTaskClick={handleTaskClick}
            />
          ))}

          <BacklogSection
            tasks={backlogTasks}
            firstStatusId={firstStatusId}
            projectId={project.id}
            sprints={allSprints}
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

      <DragOverlay>
        {activeTask && (
          <div className="bl-drag-overlay">
            <BacklogTaskRow task={activeTask} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>

      {showCreateSprint && canManage && (
        <CreateSprintModal
          projectId={project.id}
          onClose={() => setShowCreateSprint(false)}
        />
      )}
    </DndContext>
  )
}