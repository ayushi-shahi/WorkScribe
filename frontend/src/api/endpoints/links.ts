import apiClient from '@/api/client'

export interface TaskLink {
  page_id: string
  page_title: string
  space_name: string
  updated_at: string
}

export async function getTaskLinksApi(taskId: string): Promise<TaskLink[]> {
  const res = await apiClient.get<{ data: TaskLink[]; total: number }>(`/tasks/${taskId}/links`)
  return res.data.data ?? []
}

export async function createTaskLinkApi(taskId: string, pageId: string): Promise<void> {
  await apiClient.post(`/tasks/${taskId}/links`, { page_id: pageId })
}

export async function deleteTaskLinkApi(taskId: string, pageId: string): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}/links/${pageId}`)
}