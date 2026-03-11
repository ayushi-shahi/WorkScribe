// Mirror of backend Pydantic schemas — keep in sync with API responses

export interface AuthUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
}

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Project {
  id: string
  org_id: string
  name: string
  key: string
  description: string | null
  type: 'kanban' | 'scrum'
  created_at: string
}

export interface TaskStatus {
  id: string
  name: string
  category: 'todo' | 'in_progress' | 'done'
  position: number
  color: string | null
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  org_id: string
  project_id: string
  number: number
  task_id: string
  title: string
  description_json: Record<string, unknown> | null
  status_id: string
  status: TaskStatus
  assignee_id: string | null
  assignee: TaskUser | null
  reporter_id: string
  reporter: TaskUser
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  type: 'story' | 'bug' | 'task' | 'subtask'
  parent_task_id: string | null   // ← ADD THIS
  labels: Label[]
  sprint_id: string | null
  position: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface TaskUser {
  id: string
  display_name: string
  avatar_url: string | null
}

export interface Sprint {
  id: string
  org_id: string
  project_id: string
  name: string
  goal: string | null
  status: 'planned' | 'active' | 'completed'
  start_date: string | null
  end_date: string | null
  created_at: string
}

export interface WikiSpace {
  id: string
  org_id: string
  name: string
  description: string | null
  icon_emoji: string | null
  created_at: string
}

export interface Page {
  id: string
  org_id: string
  space_id: string
  parent_page_id: string | null
  title: string
  content_json: Record<string, unknown>
  author_id: string
  last_edited_by: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  entity_type: string
  entity_id: string
  is_read: boolean
  created_at: string
}

export interface OrgMember {
  user_id: string
  display_name: string
  email: string
  avatar_url: string | null
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  author: {
    id: string
    display_name: string
    email: string
    avatar_url: string | null
  }
  body_json: {
    type: string
    content: unknown[]
  }
  is_edited: boolean
  created_at: string
  updated_at: string
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
  skip: number
  limit: number
}

export interface ActivityEntry {
  id: string
  task_id: string
  actor_id: string
  actor: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  action: string
  field_name: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export interface ActivityListResponse {
  activities: ActivityEntry[]
  total: number
  skip: number
  limit: number
}

export interface TaskLink {
  page_id: string
  page_title: string
  space_name: string
  updated_at: string
}
export interface ApiError {
  code: string
  message: string
}