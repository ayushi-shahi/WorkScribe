import apiClient from '@/api/client'
import type { Task, TaskStatus, Label } from '@/types'

export interface CreateTaskRequest {
  title: string
  status_id: string
  assignee_id?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  type?: 'story' | 'bug' | 'task' | 'subtask'
  label_ids?: string[]
  sprint_id?: string
  due_date?: string
  description_json?: Record<string, unknown>
  parent_task_id?: string
}

export interface UpdateTaskRequest {
  title?: string
  status_id?: string
  assignee_id?: string | null
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  type?: 'story' | 'bug' | 'task' | 'subtask'
  label_ids?: string[]
  sprint_id?: string | null
  due_date?: string | null
  description_json?: Record<string, unknown>
}

export interface MoveTaskRequest {
  status_id: string
  position: number
}

export interface BulkPositionItem {
  task_id: string
  position: number
}

export interface TaskListResponse {
  tasks: Task[]
  total: number
  skip: number
  limit: number
}

export interface BoardFilters {
  assignee_id?: string
  priority?: string
  label_id?: string
  type?: string
  sprint_id?: string
  search?: string
}

export async function getTasksApi(
  slug: string,
  projectId: string,
  filters: BoardFilters = {},
  skip = 0,
  limit = 100
): Promise<TaskListResponse> {
  const params = new URLSearchParams()
  params.set('skip', String(skip))
  params.set('limit', String(limit))
  if (filters.assignee_id) params.set('assignee_id', filters.assignee_id)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.label_id) params.set('label_id', filters.label_id)
  if (filters.type) params.set('type', filters.type)
  if (filters.sprint_id) params.set('sprint_id', filters.sprint_id)
  if (filters.search) params.set('search', filters.search)

  const res = await apiClient.get<TaskListResponse>(
    `/organizations/${slug}/projects/${projectId}/tasks?${params.toString()}`
  )
  return res.data
}

export async function getTaskApi(taskId: string): Promise<Task> {
  const res = await apiClient.get<Task>(`/tasks/${taskId}`)
  return res.data
}

export async function createTaskApi(
  slug: string,
  projectId: string,
  data: CreateTaskRequest
): Promise<Task> {
  const res = await apiClient.post<Task>(
    `/organizations/${slug}/projects/${projectId}/tasks`,
    data
  )
  return res.data
}

export async function updateTaskApi(
  taskId: string,
  data: UpdateTaskRequest
): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${taskId}`, data)
  return res.data
}

export async function deleteTaskApi(taskId: string): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}`)
}

export async function moveTaskApi(
  taskId: string,
  data: MoveTaskRequest
): Promise<Task> {
  const res = await apiClient.patch<Task>(`/tasks/${taskId}/move`, data)
  return res.data
}

export async function bulkUpdatePositionsApi(
  items: BulkPositionItem[]
): Promise<void> {
  await apiClient.patch('/tasks/bulk-positions', { updates: items })
}

export async function getSprintsApi(
  slug: string,
  projectId: string
): Promise<SprintListResponse> {
  const res = await apiClient.get<SprintListResponse>(
    `/organizations/${slug}/projects/${projectId}/sprints`
  )
  return res.data
}

export interface SprintListResponse {
  sprints: import('@/types').Sprint[]
  total: number
}

export async function getLabelsApi(
  slug: string,
  projectId: string
): Promise<Label[]> {
  const res = await apiClient.get<Label[]>(
    `/organizations/${slug}/projects/${projectId}/labels`
  )
  return res.data
}