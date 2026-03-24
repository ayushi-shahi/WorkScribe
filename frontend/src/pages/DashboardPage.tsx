import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckSquare,
  Zap,
  Bell,
  FileText,
  ArrowRight,
  Plus,
  LayoutList,
  Clock,
} from 'lucide-react'
import {
  getDashboardApi,
  getOrgActivityApi,
  type OrgActivityEntry,
} from '@/api/endpoints/dashboard'
import { getProjectsApi } from '@/api/endpoints/projects'
import { useAuthStore } from '@/stores/authStore'
import { getInitials } from '@/lib/taskHelpers'
import '@/styles/dashboard.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAction(entry: OrgActivityEntry): string {
  const taskRef = entry.task
    ? `${entry.task.project_key}-${entry.task.number}`
    : 'a task'
  const taskTitle = entry.task?.title ?? ''

  switch (entry.action) {
    case 'TASK_CREATED':
      return `created ${taskRef} · ${taskTitle}`
    case 'COMMENT_ADDED':
      return `commented on ${taskRef} · ${taskTitle}`
    case 'DOC_LINKED':
      return `linked a doc to ${taskRef} · ${taskTitle}`
    case 'DOC_UNLINKED':
      return `unlinked a doc from ${taskRef} · ${taskTitle}`
    case 'FIELD_UPDATED': {
      if (!entry.new_value) return `updated ${taskRef}`
      const field = Object.keys(entry.new_value)[0] ?? ''
      const fieldMap: Record<string, string> = {
        status_id: 'status',
        assignee_id: 'assignee',
        priority: 'priority',
        sprint_id: 'sprint',
        title: 'title',
        due_date: 'due date',
      }
      const friendlyField = fieldMap[field] ?? field
      if (field === 'priority') {
        const val = String(entry.new_value[field])
        return `changed priority to ${val} on ${taskRef}`
      }
      return `updated ${friendlyField} on ${taskRef} · ${taskTitle}`
    }
    default:
      return `updated ${taskRef} · ${taskTitle}`
  }
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate  = useNavigate()
  const user      = useAuthStore((s) => s.user)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', slug],
    queryFn: () => getDashboardApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 30_000,
  })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['org-activity', slug],
    queryFn: () => getOrgActivityApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 30_000,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  // Resolve the best project key to use for board/backlog links:
  // 1. Use the active sprint's project key if available
  // 2. Fall back to the first project in the org
  const firstProjectKey =
    stats?.active_sprints?.[0]?.project_key ??
    projects[0]?.key ??
    'APP'

  const activities: OrgActivityEntry[] = (activityData as any)?.data ?? activityData ?? []

  return (
    <div className="dash-root">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <span className="page-header-title">Dashboard</span>
      </div>

      <div className="dash-body">

        {/* ── Welcome row ───────────────────────────────────────────── */}
        <div className="dash-welcome">
          <div className="dash-welcome-text">
            <h1 className="dash-welcome-title">
              Good {getGreeting()}, {user?.display_name?.split(' ')[0] ?? 'there'} 👋
            </h1>
            <p className="dash-welcome-sub">Here's what's happening in your workspace.</p>
          </div>
        </div>

        {/* ── Stat cards ────────────────────────────────────────────── */}
        <div className="dash-stats">
          <StatCard
            icon={<CheckSquare size={16} />}
            label="Open Tasks"
            value={stats?.open_tasks_count ?? 0}
            loading={statsLoading}
            color="brand"
          />
          <StatCard
            icon={<Zap size={16} />}
            label="Active Sprints"
            value={stats?.active_sprints_count ?? 0}
            loading={statsLoading}
            color="green"
          />
          <StatCard
            icon={<Bell size={16} />}
            label="Unread Notifications"
            value={stats?.unread_notifications_count ?? 0}
            loading={statsLoading}
            color="amber"
          />
        </div>

        {/* ── Main grid ─────────────────────────────────────────────── */}
        <div className="dash-grid">

          {/* Active sprints */}
          <div className="dash-card">
            <div className="dash-card-header">
              <Zap size={13} />
              Active Sprints
            </div>
            {statsLoading ? (
              <div className="dash-skeleton-list">
                {[1, 2].map((i) => <div key={i} className="dash-skeleton-row" />)}
              </div>
            ) : (stats?.active_sprints ?? []).length === 0 ? (
              <div className="dash-empty">
                <Zap size={20} className="dash-empty-icon" />
                No active sprints
                <button
                  className="dash-empty-action"
                  onClick={() => navigate(`/org/${slug}/projects/${firstProjectKey}/backlog`)}
                >
                  Go to Backlog
                </button>
              </div>
            ) : (
              <div className="dash-sprint-list">
                {(stats?.active_sprints ?? []).map((s) => {
                  const pct = s.total_tasks > 0
                    ? Math.round((s.done_tasks / s.total_tasks) * 100)
                    : 0
                  return (
                    <div key={s.id} className="dash-sprint-item">
                      <div className="dash-sprint-top">
                        <span className="dash-sprint-name">{s.name}</span>
                        <span className="dash-sprint-key">{s.project_key}</span>
                      </div>
                      <div className="dash-sprint-progress-bar">
                        <div
                          className="dash-sprint-progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="dash-sprint-meta">
                        <span>{s.done_tasks}/{s.total_tasks} tasks done</span>
                        <span>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="dash-card">
            <div className="dash-card-header">
              <Plus size={13} />
              Quick Actions
            </div>
            <div className="dash-actions">
              <button
                className="dash-action-btn"
                onClick={() => navigate(`/org/${slug}/projects/${firstProjectKey}/board`)}
              >
                <CheckSquare size={14} />
                View Board
                <ArrowRight size={12} className="dash-action-arrow" />
              </button>
              <button
                className="dash-action-btn"
                onClick={() => navigate(`/org/${slug}/projects/${firstProjectKey}/backlog`)}
              >
                <LayoutList size={14} />
                Go to Backlog
                <ArrowRight size={12} className="dash-action-arrow" />
              </button>
              <button
                className="dash-action-btn"
                onClick={() => navigate(`/org/${slug}/wiki`)}
              >
                <FileText size={14} />
                Browse Wiki
                <ArrowRight size={12} className="dash-action-arrow" />
              </button>
            </div>
          </div>

          {/* Recently edited docs */}
          <div className="dash-card">
            <div className="dash-card-header">
              <FileText size={13} />
              Recently Edited Docs
            </div>
            {statsLoading ? (
              <div className="dash-skeleton-list">
                {[1, 2, 3].map((i) => <div key={i} className="dash-skeleton-row" />)}
              </div>
            ) : (stats?.recent_pages ?? []).length === 0 ? (
              <div className="dash-empty">
                <FileText size={20} className="dash-empty-icon" />
                No pages yet
              </div>
            ) : (
              <div className="dash-page-list">
                {(stats?.recent_pages ?? []).map((p) => (
                  <button
                    key={p.id}
                    className="dash-page-item"
                    onClick={() => navigate(`/org/${slug}/wiki/${p.space_id}/${p.id}`)}
                  >
                    <FileText size={13} className="dash-page-icon" />
                    <span className="dash-page-content">
                      <span className="dash-page-title">{p.title}</span>
                      <span className="dash-page-meta">
                        {p.space_name} · {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                      </span>
                    </span>
                    <ArrowRight size={11} className="dash-page-arrow" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Activity feed — full width */}
          <div className="dash-card dash-card--full">
            <div className="dash-card-header">
              <Clock size={13} />
              Recent Activity
            </div>
            {activityLoading ? (
              <div className="dash-skeleton-list">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="dash-skeleton-row" />)}
              </div>
            ) : activities.length === 0 ? (
              <div className="dash-empty">
                <Clock size={20} className="dash-empty-icon" />
                No activity yet
              </div>
            ) : (
              <div className="dash-activity-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {activities.map((entry) => (
                  <div key={entry.id} className="dash-activity-item">
                    <div className="avatar avatar-sm dash-activity-avatar">
                      {getInitials(entry.actor.display_name)}
                    </div>
                    <div className="dash-activity-content">
                      <span className="dash-activity-actor">{entry.actor.display_name}</span>
                      {' '}
                      <span className="dash-activity-desc">{formatAction(entry)}</span>
                    </div>
                    <span className="dash-activity-time">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  loading: boolean
  color: 'brand' | 'green' | 'amber'
}

function StatCard({ icon, label, value, loading, color }: StatCardProps) {
  return (
    <div className={`dash-stat-card dash-stat-card--${color}`}>
      <div className="dash-stat-icon">{icon}</div>
      <div className="dash-stat-body">
        <div className="dash-stat-value">
          {loading ? <span className="dash-stat-skeleton" /> : value}
        </div>
        <div className="dash-stat-label">{label}</div>
      </div>
    </div>
  )
}

// ── Greeting helper ───────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}