// src/components/board/CreateTaskModal.tsx
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ChevronDown } from 'lucide-react'
import { createTaskApi } from '@/api/endpoints/tasks'
import { getProjectStatusesApi } from '@/api/endpoints/projects'
import { getSprintsApi, getLabelsApi } from '@/api/endpoints/tasks'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { getInitials } from '@/lib/taskHelpers'
import toast from 'react-hot-toast'
import type { TaskStatus, Sprint, Label, OrgMember } from '@/types'

interface Props {
  projectId: string
  defaultStatusId?: string
  onClose: () => void
  onCreated?: () => void
}

type PriorityValue = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type TypeValue = 'task' | 'story' | 'bug'

const PRIORITY_OPTIONS: { value: PriorityValue; label: string; color: string }[] = [
  { value: 'none',   label: 'No priority', color: 'transparent' },
  { value: 'urgent', label: 'Urgent',      color: 'var(--p-urgent)' },
  { value: 'high',   label: 'High',        color: 'var(--p-high)' },
  { value: 'medium', label: 'Medium',      color: 'var(--p-medium)' },
  { value: 'low',    label: 'Low',         color: 'var(--p-low)' },
]

const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: 'task',  label: 'Task' },
  { value: 'story', label: 'Story' },
  { value: 'bug',   label: 'Bug' },
]

function categoryColor(category: TaskStatus['category']): string {
  switch (category) {
    case 'todo':        return 'var(--text-muted)'
    case 'in_progress': return 'var(--blue)'
    case 'done':        return 'var(--green)'
    default:            return 'var(--text-muted)'
  }
}

interface InlineSelectProps {
  label: React.ReactNode
  children: React.ReactNode
  keepOpenOnSelect?: boolean
}

function InlineSelect({ label, children, keepOpenOnSelect = false }: InlineSelectProps) {
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

  return (
    <div className="ctm-inline-select" ref={ref}>
      <button
        type="button"
        className="ctm-field-btn"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <ChevronDown size={11} className="ctm-field-chevron" />
      </button>
      {open && (
        <div
          className="ctm-dropdown"
          onClick={keepOpenOnSelect ? undefined : () => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default function CreateTaskModal({ projectId, defaultStatusId, onClose, onCreated }: Props) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()

  const [title, setTitle]           = useState('')
  const [statusId, setStatusId]     = useState(defaultStatusId ?? '')
  const [priority, setPriority]     = useState<PriorityValue>('none')
  const [type, setType]             = useState<TypeValue>('task')
  const [assigneeId, setAssigneeId] = useState('')
  const [sprintId, setSprintId]     = useState('')
  const [labelIds, setLabelIds]     = useState<string[]>([])
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', slug, projectId],
    queryFn: () => getProjectStatusesApi(slug!, projectId),
    enabled: Boolean(slug && projectId),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!defaultStatusId && !statusId && statuses.length > 0) {
      setStatusId(statuses[0].id)
    }
  }, [statuses, statusId, defaultStatusId])

  const { data: sprintData } = useQuery({
    queryKey: ['sprints', slug, projectId],
    queryFn: () => getSprintsApi(slug!, projectId),
    enabled: Boolean(slug && projectId),
    staleTime: 30_000,
  })
  const sprints: Sprint[] = sprintData?.sprints ?? []

  const { data: labels = [] } = useQuery<Label[]>({
    queryKey: ['labels', slug, projectId],
    queryFn: () => getLabelsApi(slug!, projectId),
    enabled: Boolean(slug && projectId),
    staleTime: 60_000,
  })

  const { data: membersRaw } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug!),
    enabled: Boolean(slug),
    staleTime: 60_000,
  })
  const members: OrgMember[] = Array.isArray(membersRaw)
    ? (membersRaw as OrgMember[])
    : ((membersRaw as unknown as { members?: OrgMember[] })?.members ?? [])

  const mutation = useMutation({
    mutationFn: () =>
      createTaskApi(slug!, projectId, {
        title:       title.trim(),
        status_id:   statusId,
        priority,
        type,
        assignee_id: assigneeId || undefined,
        sprint_id:   sprintId   || undefined,
        label_ids:   labelIds.length > 0 ? labelIds : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', slug], exact: false, refetchType: 'all' })
      toast.success('Task created')
      onCreated?.()
      onClose()
    },
    onError: () => {
      toast.error('Failed to create task')
    },
  })

  const handleSubmit = () => {
    if (!title.trim()) return
    mutation.mutate()
  }

  const selectedStatus   = statuses.find((s) => s.id === statusId)
  const selectedPri      = PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[0]
  const selectedType     = TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0]
  const selectedAssignee = members.find((m) => m.user_id === assigneeId)
  const selectedSprint   = sprints.find((s) => s.id === sprintId)

  function toggleLabel(id: string) {
    setLabelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
  }

  return (
    <div
      className="ctm-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ctm-modal" role="dialog" aria-modal="true" aria-label="Create task">

        <div className="ctm-header">
          <span className="ctm-header-title">New Task</span>
          <button className="ctm-close-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="ctm-body">
          <textarea
            ref={titleRef}
            className="ctm-title-input"
            placeholder="Task title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            rows={2}
          />

          <div className="ctm-fields">

            <InlineSelect
              label={
                <>
                  <span
                    className="ctm-status-dot"
                    style={{
                      background: selectedStatus
                        ? categoryColor(selectedStatus.category)
                        : 'var(--text-muted)',
                    }}
                  />
                  {selectedStatus?.name ?? 'Status'}
                </>
              }
            >
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ctm-drop-item${s.id === statusId ? ' ctm-drop-item--active' : ''}`}
                  onClick={() => setStatusId(s.id)}
                >
                  <span className="ctm-status-dot" style={{ background: categoryColor(s.category) }} />
                  {s.name}
                </button>
              ))}
            </InlineSelect>

            <InlineSelect
              label={
                <>
                  <span className="ctm-priority-dot" style={{ background: selectedPri.color }} />
                  {selectedPri.value === 'none' ? 'Priority' : selectedPri.label}
                </>
              }
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ctm-drop-item${opt.value === priority ? ' ctm-drop-item--active' : ''}`}
                  onClick={() => setPriority(opt.value)}
                >
                  <span className="ctm-priority-dot" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </InlineSelect>

            <InlineSelect label={<>{selectedType.label}</>}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ctm-drop-item${opt.value === type ? ' ctm-drop-item--active' : ''}`}
                  onClick={() => setType(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </InlineSelect>

            <InlineSelect
              label={
                selectedAssignee ? (
                  <>
                    <span className="ctm-avatar">{getInitials(selectedAssignee.display_name)}</span>
                    {selectedAssignee.display_name.split(' ')[0]}
                  </>
                ) : (
                  <>Assignee</>
                )
              }
            >
              {assigneeId && (
                <button
                  type="button"
                  className="ctm-drop-item"
                  onClick={() => setAssigneeId('')}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Unassigned</span>
                </button>
              )}
              {members.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  className={`ctm-drop-item${m.user_id === assigneeId ? ' ctm-drop-item--active' : ''}`}
                  onClick={() => setAssigneeId(m.user_id)}
                >
                  <span className="ctm-avatar">{getInitials(m.display_name)}</span>
                  {m.display_name}
                </button>
              ))}
            </InlineSelect>

            {sprints.length > 0 && (
              <InlineSelect label={<>{selectedSprint?.name ?? 'Sprint'}</>}>
                {sprintId && (
                  <button
                    type="button"
                    className="ctm-drop-item"
                    onClick={() => setSprintId('')}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No sprint</span>
                  </button>
                )}
                {sprints
                  .filter((s) => s.status !== 'completed')
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`ctm-drop-item${s.id === sprintId ? ' ctm-drop-item--active' : ''}`}
                      onClick={() => setSprintId(s.id)}
                    >
                      <span
                        className="ctm-sprint-badge"
                        style={{
                          background: s.status === 'active' ? 'var(--green-bg)' : 'var(--surface3)',
                          color: s.status === 'active' ? 'var(--green)' : 'var(--text-muted)',
                        }}
                      >
                        {s.status === 'active' ? 'Active' : 'Planned'}
                      </span>
                      {s.name}
                    </button>
                  ))}
              </InlineSelect>
            )}

            {labels.length > 0 && (
              <InlineSelect
                keepOpenOnSelect
                label={
                  labelIds.length > 0
                    ? <>{labelIds.length} label{labelIds.length > 1 ? 's' : ''}</>
                    : <>Labels</>
                }
              >
                {labels.map((lbl: Label) => {
                  const checked = labelIds.includes(lbl.id)
                  return (
                    <button
                      key={lbl.id}
                      type="button"
                      className={`ctm-drop-item${checked ? ' ctm-drop-item--active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleLabel(lbl.id) }}
                    >
                      <span className="ctm-label-swatch" style={{ background: lbl.color }} />
                      {lbl.name}
                      {checked && <span className="ctm-check">✓</span>}
                    </button>
                  )
                })}
              </InlineSelect>
            )}

          </div>
        </div>

        <div className="ctm-footer">
          <button type="button" className="ctm-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ctm-btn-submit"
            onClick={handleSubmit}
            disabled={!title.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>

      </div>
    </div>
  )
}
