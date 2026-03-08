import { useState, useMemo } from 'react'
import { useParams, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { getTasksApi, getSprintsApi } from '@/api/endpoints/tasks'
import { getProjectsApi, getProjectStatusesApi } from '@/api/endpoints/projects'
import { groupTasksByStatus } from '@/lib/taskHelpers'
import { useBoardDnd } from '@/hooks/useBoardDnd'
import BoardColumn from '@/components/board/BoardColumn'
import TaskCard from '@/components/board/TaskCard'
import type { Task } from '@/types'
import '@/styles/board.css'

// ── Fix 6: Separate skeleton component ────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="board-root">
      <div className="board-header">
        <div className="skeleton" style={{ width: 120, height: 18 }} />
      </div>
      <div className="board-columns">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="board-skeleton-col">
            <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 8 }} />
            {[1, 2, 3].map((j) => (
              <div key={j} className="skeleton" style={{ height: 72, borderRadius: 8 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BoardPage() {
  const { slug, key } = useParams<{ slug: string; key: string }>()
  const navigate = useNavigate()
  const [showAllTasks, setShowAllTasks] = useState(false)

  // Fix 5: distance 8 prevents accidental drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const project = projects.find((p) => p.key === key)

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses', slug, project?.id],
    queryFn: () => getProjectStatusesApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),  // Fix 2
    staleTime: 60_000,
  })

  const { data: sprintData } = useQuery({
    queryKey: ['sprints', slug, project?.id],
    queryFn: () => getSprintsApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),  // Fix 2
    staleTime: 30_000,
  })

  const activeSprint = sprintData?.sprints.find((s) => s.status === 'active')

  // Fix 1: stable primitive in query key, not an object
  const sprintId = !showAllTasks && activeSprint ? activeSprint.id : 'all'
  const boardQueryKey = ['board', slug, project?.id, sprintId]
  const taskFilters = sprintId === 'all' ? {} : { sprint_id: sprintId }

  const { data: taskData, isLoading: tasksLoading } = useQuery({
    queryKey: boardQueryKey,
    queryFn: () =>
      getTasksApi(slug ?? '', project?.id ?? '', taskFilters, 0, 200),
    enabled: Boolean(slug && project?.id && statuses.length > 0),  // Fix 2
    staleTime: 30_000,
  })

  const tasks = taskData?.tasks ?? []

  // Fix 3: memoize grouping — important with large task lists
  const groupedTasks = useMemo(
    () => groupTasksByStatus(tasks, statuses),
    [tasks, statuses]
  )

  const { activeTask, onDragStart, onDragOver, onDragEnd } = useBoardDnd({
    slug: slug ?? '',
    projectId: project?.id ?? '',
    statuses,
    groupedTasks,
    queryKey: boardQueryKey,
  })

  const handleTaskClick = (task: Task) => {
    navigate(`?task=${task.task_id}`)
  }

  const handleQuickAdd = (_statusId: string) => {
    // wired in D8
  }

  // Fix 6: separate concerns — no project = nothing to render yet
  if (!project) return null

  if (tasksLoading) return <BoardSkeleton />

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="board-root">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="board-header">
          <span className="board-header-title">{project.name}</span>
          <div className="board-header-divider" />

          <div className="board-header-tabs">
            <NavLink
              to={`/org/${slug}/projects/${key}/board`}
              className={({ isActive }) => `board-tab${isActive ? ' active' : ''}`}
            >
              Board
            </NavLink>
            <NavLink
              to={`/org/${slug}/projects/${key}/backlog`}
              className={({ isActive }) => `board-tab${isActive ? ' active' : ''}`}
            >
              Backlog
            </NavLink>
          </div>

          <div className="board-header-spacer" />

          {activeSprint && (
            <button
              onClick={() => setShowAllTasks((v) => !v)}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 'var(--radius-sm)',
                background: showAllTasks ? 'var(--surface2)' : 'var(--brand-light)',
                border: `1px solid ${showAllTasks ? 'var(--border)' : 'var(--brand-mid)'}`,
                color: showAllTasks ? 'var(--text-secondary)' : 'var(--brand)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {showAllTasks ? 'All tasks' : activeSprint.name}
            </button>
          )}

          {/* Fix 4: New Task navigates to backlog with create flag */}
          <button
            onClick={() =>
              navigate(`/org/${slug}/projects/${key}/backlog?create=true`)
            }
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--brand)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={13} />
            New Task
          </button>
        </div>

        {/* ── Columns ─────────────────────────────────────────── */}
        <div className="board-columns">
          {statuses.map((status) => {
            const columnTasks = groupedTasks.get(status.id) ?? []
            return (
              <BoardColumn
                key={status.id}
                status={status}
                tasks={columnTasks}
                onTaskClick={handleTaskClick}
                onQuickAdd={handleQuickAdd}
              />
            )
          })}
        </div>
      </div>

      {/* ── Drag overlay ────────────────────────────────────────── */}
      <DragOverlay>
        {activeTask && (
          <TaskCard task={activeTask} onClick={() => {}} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  )
}