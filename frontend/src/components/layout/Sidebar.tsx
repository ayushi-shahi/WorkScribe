import { useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Plus,
  BookOpen,
  Settings,
  Users,
  Circle,
  SlidersHorizontal,
} from 'lucide-react'
import { getProjectsApi } from '@/api/endpoints/projects'
import { getWikiSpacesApi } from '@/api/endpoints/wiki'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import type { Organization } from '@/types'
import '@/styles/layout.css'

interface SidebarProps {
  org: Organization
}

export default function Sidebar({ org }: SidebarProps) {
  const { slug, key: activeKey } = useParams<{ slug: string; key: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [wikiExpanded, setWikiExpanded] = useState(true)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const { data: wikiSpaces = [] } = useQuery({
    queryKey: ['wiki-spaces', slug],
    queryFn: () => getWikiSpacesApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const { data: rawMembers } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const members = (() => {
    if (!rawMembers) return []
    if (Array.isArray(rawMembers)) return rawMembers
    return (rawMembers as { members?: typeof rawMembers[] }).members ?? []
  })()

  const currentMember = members.find((m: any) => m.user_id === currentUser?.id)
  const currentRole   = currentMember?.role ?? 'member'
  const canManage     = currentRole === 'owner' || currentRole === 'admin'

  return (
    <aside className="sidebar">
      {/* ── Main nav ──────────────────────────────────────────── */}
      <div className="sidebar-section">
        <NavLink
          to={`/org/${slug}/dashboard`}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-item-icon"><LayoutDashboard size={15} /></span>
          <span className="sidebar-item-text">Dashboard</span>
        </NavLink>

        <NavLink
          to={`/org/${slug}/my-work`}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-item-icon"><CheckSquare size={15} /></span>
          <span className="sidebar-item-text">My Work</span>
        </NavLink>
      </div>

      <div className="sidebar-divider" />

      {/* ── Projects ──────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <button
            className="sidebar-section-toggle"
            onClick={() => setProjectsExpanded((v) => !v)}
          >
            <span className="sidebar-section-label">Projects</span>
            {projectsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {canManage && (
            <button
              className="sidebar-action-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('sidebar:new-project'))}
              title="New project"
              aria-label="New project"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        {projectsExpanded && (
          <>
            {projects.length === 0 && (
              <div className="sidebar-empty">No projects yet</div>
            )}
            {projects.map((project) => {
              const isActiveProject = project.key === activeKey
              return (
                <div key={project.id} className="sidebar-project-row">
                  <NavLink
                    to={`/org/${slug}/projects/${project.key}/board`}
                    className={({ isActive }) => `sidebar-item sidebar-item--project${isActive ? ' active' : ''}`}
                  >
                    <span className="sidebar-item-icon">
                      <ProjectDot color={projectColor(project.key)} />
                    </span>
                    <span className="sidebar-item-text">{project.name}</span>
                    <span className="sidebar-item-badge">{project.key}</span>
                  </NavLink>
                  {/* Settings gear — only visible when project is active + canManage */}
                  {isActiveProject && canManage && (
                    <NavLink
                      to={`/org/${slug}/projects/${project.key}/settings`}
                      className={({ isActive }) =>
                        `sidebar-project-settings-btn${isActive ? ' active' : ''}`
                      }
                      title="Project settings"
                      aria-label="Project settings"
                    >
                      <SlidersHorizontal size={12} />
                    </NavLink>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* ── Wiki ──────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <button
            className="sidebar-section-toggle"
            onClick={() => setWikiExpanded((v) => !v)}
          >
            <span className="sidebar-section-label">Wiki</span>
            {wikiExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {canManage && (
            <button
              className="sidebar-action-btn"
              onClick={() => {
                navigate(`/org/${slug}/wiki`)
                window.dispatchEvent(new CustomEvent('wiki:new-space'))
              }}
              title="New wiki space"
              aria-label="New wiki space"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        {wikiExpanded && (
          <>
            {wikiSpaces.length === 0 && (
              <div className="sidebar-empty">No spaces yet</div>
            )}
            {wikiSpaces.map((space) => (
              <NavLink
                key={space.id}
                to={`/org/${slug}/wiki/${space.id}`}
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
              >
                <span className="sidebar-item-icon" style={{ fontSize: 13 }}>
                  {space.icon_emoji ?? <BookOpen size={13} />}
                </span>
                <span className="sidebar-item-text">{space.name}</span>
              </NavLink>
            ))}
          </>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* ── Bottom nav ────────────────────────────────────────── */}
      <div className="sidebar-section">
        <NavLink
          to={`/org/${slug}/settings/members`}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
        >
          <span className="sidebar-item-icon"><Users size={15} /></span>
          <span className="sidebar-item-text">Members</span>
        </NavLink>

        {canManage && (
          <NavLink
            to={`/org/${slug}/settings`}
            end
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-item-icon"><Settings size={15} /></span>
            <span className="sidebar-item-text">Settings</span>
          </NavLink>
        )}
      </div>
    </aside>
  )
}

function ProjectDot({ color }: { color: string }) {
  return <Circle size={8} fill={color} stroke={color} />
}

const PROJECT_COLORS = [
  '#5E6AD2', '#7C85E0', '#4ADE80', '#60A5FA',
  '#FB923C', '#F87171', '#FCD34D', '#A78BFA',
]

function projectColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length] ?? '#5E6AD2'
}