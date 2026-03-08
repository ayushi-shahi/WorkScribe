import { Plus } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableTaskCard from '@/components/board/SortableTaskCard'
import { statusColor } from '@/lib/taskHelpers'
import type { Task, TaskStatus } from '@/types'

interface BoardColumnProps {
  status: TaskStatus
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onQuickAdd: (statusId: string) => void
  isDragOver?: boolean
}

export default function BoardColumn({
  status,
  tasks,
  onTaskClick,
  onQuickAdd,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div className={`board-column${isOver ? ' drag-over' : ''}`}>
      <div className="board-column-header">
        <div
          className="board-column-dot"
          style={{ background: statusColor(status.category) }}
        />
        <span className="board-column-name">{status.name}</span>
        <span className="board-column-count">{tasks.length}</span>
      </div>

      <SortableContext
        id={status.id}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="board-column-body">
          {tasks.length === 0 && (
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

      <div className="board-quick-add">
        <button
          className="board-quick-add-btn"
          onClick={() => onQuickAdd(status.id)}
        >
          <Plus size={13} />
          Add task
        </button>
      </div>
    </div>
  )
}