import apiClient from '@/api/client'

export interface ActivityEntry {
  id: string
  actor: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface ActivityListResponse {
  activities: ActivityEntry[]
  total: number
  skip: number
  limit: number
}

export async function getActivityApi(taskId: string): Promise<ActivityListResponse> {
  const res = await apiClient.get<ActivityListResponse>(`/tasks/${taskId}/activity`)
  return res.data
}