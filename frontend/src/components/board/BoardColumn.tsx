// src/components/board/BoardColumn.tsx
import { useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { createTaskApi } from '@/api/endpoints/tasks'
import SortableTaskCard from '@/components/board/SortableTaskCard'
import { statusColor } from '@/lib/taskHelpers'
import toast from 'react-hot-toast'
import type { Task, TaskStatus } from '@/types'

interface BoardColumnProps {
  status: TaskStatus
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onQuickAdd: (statusId: string) => void
  isDragOver?: boolean
}

// ── Inline quick-add input ────────────────────────────────────────────────────

interface QuickAddInputProps {
  statusId: string
  onCancel: () => void
}

function QuickAddInput({ statusId, onCancel }: QuickAddInputProps) {
  const { slug, key } = useParams<{ slug: string; key: string }>()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Focus on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // We need the projectId — get it from the board query cache via slug+key
  // BoardPage stores projects under ['projects', slug]
  const projectsRaw = queryClient.getQueryData<{ id: string; key: string }[]>(
    ['projects', slug]
  )
  const projectId = projectsRaw?.find((p) => p.key === key)?.id ?? ''

  const mutation = useMutation({
    mutationFn: () =>
      createTaskApi(slug!, projectId, {
        title: title.trim(),
        status_id: statusId,
      }),
    onSuccess: () => {
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
    <div className="quick-add-input-wrap">
      <textarea
        ref={inputRef}
        className="quick-add-textarea"
        placeholder="Task title…"
        value={title}
        rows={2}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
          if (e.key === 'Escape') {
            onCancel()
          }
        }}
      />
      <div className="quick-add-actions">
        <button
          type="button"
          className="quick-add-submit"
          onClick={handleSubmit}
          disabled={!title.trim() || mutation.isPending}
        >
          {mutation.isPending ? '…' : 'Add'}
        </button>
        <button
          type="button"
          className="quick-add-cancel"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

// ── BoardColumn ───────────────────────────────────────────────────────────────

export default function BoardColumn({
  status,
  tasks,
  onTaskClick,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  return (
    <div className={`board-column${isOver ? ' drag-over' : ''}`}>
      {/* Header */}
      <div className="board-column-header">
        <div
          className="board-column-dot"
          style={{ background: statusColor(status.category) }}
        />
        <span className="board-column-name">{status.name}</span>
        <span className="board-column-count">{tasks.length}</span>
      </div>

      {/* Task list */}
      <SortableContext
        id={status.id}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="board-column-body">
          {tasks.length === 0 && !showQuickAdd && (
            <div className="board-column-empty">Drop tasks here</div>
          )}
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
            />
          ))}
        </div>
      </SortableContext>

      {/* Quick-add area */}
      <div className="board-quick-add">
        {showQuickAdd ? (
          <QuickAddInput
            statusId={status.id}
            onCancel={() => setShowQuickAdd(false)}
          />
        ) : (
          <button
            className="board-quick-add-btn"
            onClick={() => setShowQuickAdd(true)}
          >
            <Plus size={13} />
            Add task
          </button>
        )}
      </div>
    </div>
  )
}