import type { Task, TaskStatus } from '@/types'

// Group tasks by status_id
export function groupTasksByStatus(
  tasks: Task[],
  statuses: TaskStatus[]
): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const status of statuses) {
    map.set(status.id, [])
  }
  for (const task of tasks) {
    const bucket = map.get(task.status_id)
    if (bucket) {
      bucket.push(task)
    }
  }
  // Sort each column by position
  for (const [, bucket] of map) {
    bucket.sort((a, b) => a.position - b.position)
  }
  return map
}

// Priority dot color
export function priorityColor(
  priority: Task['priority']
): string {
  switch (priority) {
    case 'urgent': return 'var(--p-urgent)'
    case 'high':   return 'var(--p-high)'
    case 'medium': return 'var(--p-medium)'
    case 'low':    return 'var(--p-low)'
    default:       return 'transparent'
  }
}

// Status dot color
export function statusColor(category: TaskStatus['category']): string {
  switch (category) {
    case 'todo':        return 'var(--text-muted)'
    case 'in_progress': return 'var(--blue)'
    case 'done':        return 'var(--green)'
    default:            return 'var(--text-muted)'
  }
}

// Initials from display name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}