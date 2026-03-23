// src/pages/BoardPage.tsx
import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, ChevronDown, CheckSquare  } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { getTasksApi, getSprintsApi, getLabelsApi } from '@/api/endpoints/tasks'
import { getProjectsApi, getProjectStatusesApi } from '@/api/endpoints/projects'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { groupTasksByStatus } from '@/lib/taskHelpers'
import { useBoardDnd } from '@/hooks/useBoardDnd'
import BoardColumn from '@/components/board/BoardColumn'
import TaskCard from '@/components/board/TaskCard'
import CreateTaskModal from '@/components/board/CreateTaskModal'
import type { Task, Label, OrgMember } from '@/types'
import '@/styles/board.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilterState {
  assignees: string[]
  priorities: string[]
  labels: string[]
}

const EMPTY_FILTERS: FilterState = { assignees: [], priorities: [], labels: [] }

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: 'var(--p-urgent)' },
  { value: 'high',   label: 'High',   color: 'var(--p-high)' },
  { value: 'medium', label: 'Medium', color: 'var(--p-medium)' },
  { value: 'low',    label: 'Low',    color: 'var(--p-low)' },
  { value: 'none',   label: 'None',   color: 'var(--text-muted)' },
]

// ── Filter dropdown ───────────────────────────────────────────────────────────

interface FilterDropdownProps {
  label: string
  activeCount: number
  onClear: () => void
  children: React.ReactNode
}

function FilterDropdown({ label, activeCount, onClear, children }: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isActive = activeCount > 0

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        type="button"
        className={`filter-btn${isActive ? ' filter-btn--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        {isActive ? (
          <>
            <span className="filter-btn-count">{activeCount}</span>
            <span
              className="filter-btn-clear"
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label} filter`}
              onClick={(e) => { e.stopPropagation(); onClear() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClear() } }}
            >
              <X size={10} />
            </span>
          </>
        ) : (
          <ChevronDown
            size={11}
            className={`filter-btn-chevron${open ? ' filter-btn-chevron--open' : ''}`}
          />
        )}
      </button>
      {open && (
        <div className="filter-menu">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── BoardPage ─────────────────────────────────────────────────────────────────

export default function BoardPage() {
  const { slug, key } = useParams<{ slug: string; key: string }>()
  const navigate = useNavigate()
  const [showAllTasks, setShowAllTasks] = useState(true)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── Queries ────────────────────────────────────────────────────────────────

const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const project = projects.find((p) => p.key === key)

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses', slug, project?.id],
    queryFn: () => getProjectStatusesApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 60_000,
  })

  const { data: sprintData } = useQuery({
    queryKey: ['sprints', slug, project?.id],
    queryFn: () => getSprintsApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const activeSprint = sprintData?.sprints.find((s) => s.status === 'active')
  const sprintId = !showAllTasks && activeSprint ? activeSprint.id : 'all'
  const boardQueryKey = ['board', slug, project?.id, sprintId]
  const taskFilters = sprintId === 'all' ? {} : { sprint_id: sprintId }

  const { data: taskData, isLoading: tasksLoading } = useQuery({
    queryKey: boardQueryKey,
    queryFn: () => getTasksApi(slug ?? '', project?.id ?? '', taskFilters, 0, 100),
    enabled: Boolean(slug && project?.id && statuses.length > 0),
    staleTime: 30_000,
  })

  const { data: labels = [] } = useQuery<Label[]>({
    queryKey: ['labels', slug, project?.id],
    queryFn: () => getLabelsApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 60_000,
  })

  const { data: membersRaw } = useQuery({
  queryKey: ['members', slug],
  queryFn: () => getOrgMembersApi(slug ?? ''),
  enabled: Boolean(slug),
  staleTime: 60_000,
  })
  const members: OrgMember[] = Array.isArray(membersRaw)
  ? (membersRaw as OrgMember[])
  : ((membersRaw as unknown as { members?: OrgMember[] })?.members ?? [])  

  // ── Filtering ──────────────────────────────────────────────────────────────

  const rawTasks: Task[] = taskData?.tasks ?? []
  const allTasks: Task[] = rawTasks
    .filter((t) => t.type !== 'subtask')
    .map((t) => ({
      ...t,
      task_id: t.task_id || (project ? `${project.key}-${t.number}` : t.task_id),
    }))
  
  const filteredTasks = useMemo(() => {
    return allTasks.filter((task) => {
      if (filters.assignees.length > 0) {
        if (!task.assignee_id || !filters.assignees.includes(task.assignee_id)) return false
      }
      if (filters.priorities.length > 0) {
        const p = task.priority ?? 'none'
        if (!filters.priorities.includes(p)) return false
      }
      if (filters.labels.length > 0) {
        const taskLabelIds = task.labels?.map((l) => l.id) ?? []
        if (!filters.labels.some((id) => taskLabelIds.includes(id))) return false
      }
      return true
    })
  }, [allTasks, filters])

  const groupedTasks = useMemo(
    () => groupTasksByStatus(filteredTasks, statuses),
    [filteredTasks, statuses]
  )

  const totalActiveFilters =
    filters.assignees.length + filters.priorities.length + filters.labels.length

  function toggleFilter<K extends keyof FilterState>(key: K, value: string) {
    setFilters((prev) => {
      const current = prev[key] as string[]
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [key]: next }
    })
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

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

  if (projectsLoading || !project || tasksLoading) return <BoardSkeleton />

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="board-root">

          {/* ── Header ────────────────────────────────────────────────────── */}
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

            <button
              onClick={() => setShowCreateModal(true)}
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

          {/* ── Filter toolbar ──────────────────────────────────────────── */}
          <div className="board-toolbar">

            <FilterDropdown
              label="Assignee"
              activeCount={filters.assignees.length}
              onClear={() => setFilters((f) => ({ ...f, assignees: [] }))}
            >
              {members.length === 0 ? (
                <div className="filter-menu-empty">No members</div>
              ) : (
                members.map((m) => {
                  const checked = filters.assignees.includes(m.user_id)
                  const initials = m.display_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      className={`filter-menu-item${checked ? ' filter-menu-item--checked' : ''}`}
                      onClick={() => toggleFilter('assignees', m.user_id)}
                    >
                      <span className="filter-menu-avatar">{initials}</span>
                      <span className="filter-menu-label">{m.display_name}</span>
                      {checked && <span className="filter-menu-check">✓</span>}
                    </button>
                  )
                })
              )}
            </FilterDropdown>

            <FilterDropdown
              label="Priority"
              activeCount={filters.priorities.length}
              onClear={() => setFilters((f) => ({ ...f, priorities: [] }))}
            >
              {PRIORITY_OPTIONS.map((opt) => {
                const checked = filters.priorities.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`filter-menu-item${checked ? ' filter-menu-item--checked' : ''}`}
                    onClick={() => toggleFilter('priorities', opt.value)}
                  >
                    <span className="filter-menu-dot" style={{ background: opt.color }} />
                    <span className="filter-menu-label">{opt.label}</span>
                    {checked && <span className="filter-menu-check">✓</span>}
                  </button>
                )
              })}
            </FilterDropdown>

            <FilterDropdown
              label="Label"
              activeCount={filters.labels.length}
              onClear={() => setFilters((f) => ({ ...f, labels: [] }))}
            >
              {labels.length === 0 ? (
                <div className="filter-menu-empty">No labels</div>
              ) : (
                labels.map((lbl: Label) => {
                  const checked = filters.labels.includes(lbl.id)
                  return (
                    <button
                      key={lbl.id}
                      type="button"
                      className={`filter-menu-item${checked ? ' filter-menu-item--checked' : ''}`}
                      onClick={() => toggleFilter('labels', lbl.id)}
                    >
                      <span className="filter-menu-color" style={{ background: lbl.color }} />
                      <span className="filter-menu-label">{lbl.name}</span>
                      {checked && <span className="filter-menu-check">✓</span>}
                    </button>
                  )
                })
              )}
            </FilterDropdown>

            {totalActiveFilters > 0 && (
              <button
                type="button"
                className="filter-clear-all"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                <X size={11} />
                Clear all
              </button>
            )}

            {totalActiveFilters > 0 && (
              <span className="filter-active-summary">
                {filteredTasks.length} of {allTasks.length} tasks
              </span>
            )}
          </div>

          {/* ── Columns ─────────────────────────────────────────────────── */}
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

          {/* ── Empty: no tasks at all ───────────────────────────────────── */}
          {allTasks.length === 0 && (
            <div className="board-empty">
              <div className="board-empty-icon">
                <CheckSquare size={36} strokeWidth={1.2} />
              </div>
              <p className="board-empty-title">No tasks yet</p>
              <p className="board-empty-sub">
                Create your first task to start tracking work
              </p>
              <button
                className="board-empty-action"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={13} />
                Create Task
              </button>
            </div>
          )}

          {/* ── Empty: filters active but nothing matches ────────────────── */}
          {allTasks.length > 0 && filteredTasks.length === 0 && (
            <div className="board-empty">
              <div className="board-empty-icon">
                <X size={36} strokeWidth={1.2} />
              </div>
              <p className="board-empty-title">No tasks match your filters</p>
              <p className="board-empty-sub">
                Try adjusting or clearing your filters
              </p>
              <button
                className="board-empty-action"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </button>
            </div>
          )}
          </div>
    

        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} onClick={() => {}} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Create Task Modal ──────────────────────────────────────────── */}
      {showCreateModal && project && (
        <CreateTaskModal
          projectId={project.id}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  )
}