import apiClient from '@/api/client'
import type { Comment, CommentListResponse } from '@/types'

export type { Comment, CommentListResponse }

export async function getCommentsApi(taskId: string): Promise<CommentListResponse> {
  const res = await apiClient.get<CommentListResponse>(`/tasks/${taskId}/comments`)
  return res.data
}

export async function createCommentApi(
  taskId: string,
  content: string
): Promise<Comment> {
  const body_json = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: content.trim() ? [{ type: 'text', text: content.trim() }] : [],
      },
    ],
  }
  const res = await apiClient.post<Comment>(`/tasks/${taskId}/comments`, { body_json })
  return res.data
}

export async function deleteCommentApi(
  taskId: string,
  commentId: string
): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}/comments/${commentId}`)
}