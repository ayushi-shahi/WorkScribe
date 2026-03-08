import apiClient from '@/api/client'

export interface Comment {
  id: string
  task_id: string
  author: {
    id: string
    display_name: string
    email: string
  }
  content: string
  created_at: string
  updated_at: string
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
}

export async function getCommentsApi(taskId: string): Promise<CommentListResponse> {
  const res = await apiClient.get<CommentListResponse>(`/tasks/${taskId}/comments`)
  return res.data
}

export async function createCommentApi(
  taskId: string,
  content: string
): Promise<Comment> {
  const res = await apiClient.post<Comment>(`/tasks/${taskId}/comments`, { content })
  return res.data
}

export async function deleteCommentApi(
  taskId: string,
  commentId: string
): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}/comments/${commentId}`)
}