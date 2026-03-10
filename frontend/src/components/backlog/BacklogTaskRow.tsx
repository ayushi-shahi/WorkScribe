// src/components/backlog/BacklogTaskRow.tsx
import { priorityColor, statusColor, getInitials } from '@/lib/taskHelpers'
import type { Task, Sprint } from '@/types'

interface BacklogTaskRowProps {
  task: Task
  sprint?: Sprint
  onClick: (task: Task) => void
}

export default function BacklogTaskRow({ task, sprint, onClick }: BacklogTaskRowProps) {
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

      {sprint && (
        <span className="bl-sprint-badge bl-sprint-badge--row">
          {sprint.name}
        </span>
      )}

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