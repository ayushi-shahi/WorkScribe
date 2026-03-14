import type { Task } from '@/types'
import { priorityColor, getInitials } from '@/lib/taskHelpers'

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
  isDragging?: boolean
}

export default function TaskCard({ task, onClick, isDragging = false }: TaskCardProps) {
  return (
    <div
      className={`task-card${isDragging ? ' dragging' : ''}`}
      onClick={() => onClick(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(task)}
      aria-label={`Task ${task.task_id}: ${task.title}`}
    >
      {/* Top row: priority dot + task ID */}
      <div className="task-card-top">
        <div
          className="task-card-priority-dot"
          style={{ background: priorityColor(task.priority) }}
          title={task.priority}
        />
        <span className="task-card-id">{task.task_id}</span>
      </div>

      {/* Title */}
      <div className="task-card-title">{task.title}</div>

      {/* Footer: labels + assignee */}
      <div className="task-card-footer">
        <div className="task-card-labels">
          {(task.labels ?? []).slice(0, 2).map((label) => (
            <span key={label.id} className="task-label-chip">
              {label.name}
            </span>
          ))}
        </div>
        {task.assignee && (
          <div
            className="avatar avatar-xs task-card-assignee"
            title={task.assignee.display_name}
          >
            {getInitials(task.assignee.display_name)}
          </div>
        )}
      </div>
    </div>
  )
}