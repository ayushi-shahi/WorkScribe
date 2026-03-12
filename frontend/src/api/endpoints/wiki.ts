import apiClient from '@/api/client'
import type { WikiSpace, Page } from '@/types'

export interface CreateSpaceRequest {
  name: string
  key: string          // required by backend — auto-derived from name as slug
  description?: string
  icon_emoji?: string
}

export interface CreatePageRequest {
  title: string
  parent_page_id?: string
}

export interface UpdatePageRequest {
  title?: string
  content_json?: Record<string, unknown>
}

export interface PageTreeNode {
  id: string
  title: string
  position: number
  parent_page_id: string | null
  children: PageTreeNode[]
}

export async function getWikiSpacesApi(slug: string): Promise<WikiSpace[]> {
  const res = await apiClient.get<{ spaces: WikiSpace[]; total: number }>(
    `/organizations/${slug}/wiki/spaces`
  )
  return Array.isArray(res.data.spaces) ? res.data.spaces : []
}

export async function createWikiSpaceApi(
  slug: string,
  data: CreateSpaceRequest
): Promise<WikiSpace> {
  const res = await apiClient.post<WikiSpace>(
    `/organizations/${slug}/wiki/spaces`,
    data
  )
  return res.data
}

export async function getPageTreeApi(spaceId: string): Promise<PageTreeNode[]> {
  const res = await apiClient.get<
    PageTreeNode[] | { pages: PageTreeNode[]; total: number }
  >(`/wiki/spaces/${spaceId}/pages`)
  const data = res.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'pages' in data && Array.isArray(data.pages)) {
    return data.pages
  }
  return []
}

export async function getPageApi(pageId: string): Promise<Page> {
  const res = await apiClient.get<Page>(`/wiki/pages/${pageId}`)
  return res.data
}

export async function createPageApi(
  spaceId: string,
  data: CreatePageRequest
): Promise<Page> {
  const res = await apiClient.post<Page>(`/wiki/spaces/${spaceId}/pages`, data)
  return res.data
}

export async function updatePageApi(
  pageId: string,
  data: UpdatePageRequest
): Promise<Page> {
  const res = await apiClient.patch<Page>(`/wiki/pages/${pageId}`, data)
  return res.data
}

export async function deletePageApi(pageId: string, force = false): Promise<void> {
  await apiClient.delete(`/wiki/pages/${pageId}${force ? '?force=true' : ''}`)
}