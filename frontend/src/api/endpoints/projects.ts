import apiClient from '@/api/client'
import type { Project, TaskStatus } from '@/types'

export interface CreateProjectRequest {
  name: string
  key: string
  description?: string
  type: 'kanban' | 'scrum'
}

export async function getProjectsApi(slug: string): Promise<Project[]> {
  const res = await apiClient.get<{ projects: Project[]; total: number }>(
    `/organizations/${slug}/projects`
  )
  return res.data.projects
}

export async function getProjectApi(slug: string, projectId: string): Promise<Project> {
  const res = await apiClient.get<Project>(`/organizations/${slug}/projects/${projectId}`)
  return res.data
}

export async function createProjectApi(
  slug: string,
  data: CreateProjectRequest
): Promise<Project> {
  const res = await apiClient.post<Project>(`/organizations/${slug}/projects`, data)
  return res.data
}

export async function getProjectStatusesApi(
  slug: string,
  projectId: string
): Promise<TaskStatus[]> {
  const res = await apiClient.get<TaskStatus[]>(
    `/organizations/${slug}/projects/${projectId}/statuses`
  )
  return res.data
}