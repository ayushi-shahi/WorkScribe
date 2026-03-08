import { useRef, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, Search, ChevronDown, LogOut, User, Settings } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { logoutApi } from '@/api/endpoints/auth'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import type { Organization } from '@/types'
import '@/styles/layout.css'

interface TopbarProps {
  org: Organization
}

export default function Topbar({ org }: TopbarProps) {
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const openCommandPalette = useUIStore((s) => s.openCommandPalette)
  const toggleNotificationsPanel = useUIStore((s) => s.toggleNotificationsPanel)

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  // Close avatar menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false)
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [avatarMenuOpen])

  // Global Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openCommandPalette()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openCommandPalette])

  const { mutate: logout } = useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      clearAuth()
      sessionStorage.removeItem('refresh_token')
      navigate('/login', { replace: true })
    },
  })

  const initials = user?.display_name
    ? user.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <header className="topbar">
      {/* ── Left: logo + org switcher ────────────────────── */}
      <div className="topbar-left">
        <div
          className="logo-mark"
          onClick={() => navigate(`/org/${slug}/dashboard`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/org/${slug}/dashboard`)}
          aria-label="Go to dashboard"
        >
          W
        </div>

        <button className="org-switcher" aria-label="Organisation switcher">
          <span className="org-switcher-name">{org.name}</span>
          <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* ── Center: search ───────────────────────────────── */}
      <div className="topbar-center">
        <button
          className="topbar-search"
          onClick={openCommandPalette}
          aria-label="Open search (Ctrl+K)"
        >
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span className="topbar-search-text">Search tasks, docs…</span>
          <kbd className="topbar-search-kbd">⌘K</kbd>
        </button>
      </div>

      {/* ── Right: notif bell + avatar ───────────────────── */}
      <div className="topbar-right">
        {/* Notification bell — stub, wired in H2 */}
        <button
          className="topbar-icon-btn"
          onClick={toggleNotificationsPanel}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {/* Unread badge — wired in H2 */}
          {/* <span className="notif-badge" /> */}
        </button>

        {/* Avatar + dropdown */}
        <div ref={avatarMenuRef} style={{ position: 'relative' }}>
          <button
            className="topbar-icon-btn"
            style={{ width: 'auto', padding: '0 4px', gap: 6 }}
            onClick={() => setAvatarMenuOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={avatarMenuOpen}
          >
            <div className="avatar avatar-md">
              {initials}
            </div>
          </button>

          {avatarMenuOpen && (
            <div className="topbar-dropdown" role="menu">
              {/* User info */}
              <div className="topbar-dropdown-header">
                <div className="avatar avatar-lg" style={{ flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="topbar-dropdown-name">{user?.display_name}</div>
                  <div className="topbar-dropdown-email">{user?.email}</div>
                </div>
              </div>

              <div className="topbar-dropdown-divider" />

              <button
                className="topbar-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setAvatarMenuOpen(false)
                  navigate(`/org/${slug}/settings`)
                }}
              >
                <Settings size={14} />
                Settings
              </button>

              <button
                className="topbar-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setAvatarMenuOpen(false)
                  navigate(`/org/${slug}/settings/members`)
                }}
              >
                <User size={14} />
                Members
              </button>

              <div className="topbar-dropdown-divider" />

              <button
                className="topbar-dropdown-item danger"
                role="menuitem"
                onClick={() => {
                  setAvatarMenuOpen(false)
                  logout()
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}