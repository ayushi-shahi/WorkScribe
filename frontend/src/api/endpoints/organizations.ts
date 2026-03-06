import apiClient from '@/api/client'
import type { Organization, OrgMember } from '@/types'

export interface CreateOrgRequest {
  name: string
  slug: string
}

export interface UpdateOrgRequest {
  name?: string
  slug?: string
}

export interface InviteMemberRequest {
  email: string
  role: 'admin' | 'member'
}

export async function createOrgApi(data: CreateOrgRequest): Promise<Organization> {
  const res = await apiClient.post<Organization>('/organizations', data)
  return res.data
}

export async function getOrgApi(slug: string): Promise<Organization> {
  const res = await apiClient.get<Organization>(`/organizations/${slug}`)
  return res.data
}

export async function updateOrgApi(
  slug: string,
  data: UpdateOrgRequest
): Promise<Organization> {
  const res = await apiClient.patch<Organization>(`/organizations/${slug}`, data)
  return res.data
}

export async function getOrgMembersApi(slug: string): Promise<OrgMember[]> {
  const res = await apiClient.get<OrgMember[]>(`/organizations/${slug}/members`)
  return res.data
}

export async function inviteMemberApi(
  slug: string,
  data: InviteMemberRequest
): Promise<void> {
  await apiClient.post(`/organizations/${slug}/invite`, data)
}

export async function checkSlugApi(slug: string): Promise<{ available: boolean }> {
  try {
    await apiClient.get(`/organizations/${slug}`)
    // If it resolves, slug is taken
    return { available: false }
  } catch {
    // 404 means slug is available
    return { available: true }
  }
}