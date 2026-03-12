import client from '@/api/client'

export interface DashboardStats {
  open_tasks_count: number
  active_sprints_count: number
  unread_notifications_count: number
  active_sprints: ActiveSprintSummary[]
  recent_pages: RecentPage[]
}

export interface ActiveSprintSummary {
  id: string
  name: string
  project_key: string
  project_name: string
  total_tasks: number
  done_tasks: number
  start_date: string | null
  end_date: string | null
}

export interface RecentPage {
  id: string
  title: string
  space_id: string
  space_name: string
  updated_at: string
}

export interface OrgActivityEntry {
  id: string
  action: string
  entity_type: string
  entity_id: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  actor: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  task: {
    id: string
    title: string
    number: number
    project_key: string
  } | null
}

export interface OrgActivityResponse {
  activities: OrgActivityEntry[]
  meta: { total: number; skip: number; limit: number }
}

export const getDashboardApi = (slug: string) =>
  client.get<DashboardStats>(`/organizations/${slug}/dashboard`).then((r) => r.data)

export const getOrgActivityApi = (slug: string) =>
  client.get<OrgActivityResponse>(`/organizations/${slug}/activity`).then((r) => r.data)