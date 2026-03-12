import apiClient from '@/api/client'
import type { Notification } from '@/types'

export interface NotificationListResponse {
  data: Notification[]
  total: number
  unread_count: number
}

export async function getNotificationsApi(): Promise<NotificationListResponse> {
  const res = await apiClient.get<NotificationListResponse>('/notifications')
  return res.data
}

export async function markNotificationReadApi(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsReadApi(): Promise<void> {
  await apiClient.post('/notifications/mark-all-read')
}