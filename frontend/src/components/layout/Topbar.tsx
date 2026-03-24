import { useRef, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, Search, ChevronDown, LogOut, User, Settings, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { logoutApi, getOrgsApi } from '@/api/endpoints/auth'
import { getNotificationsApi } from '@/api/endpoints/notifications'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import type { Organization } from '@/types'
import '@/styles/layout.css'

interface TopbarProps {
  org: Organization
}

export default function Topbar({ org }: TopbarProps) {
  const navigate   = useNavigate()
  const { slug }   = useParams<{ slug: string }>()
  const user            = useAuthStore((s) => s.user)
  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const openCommandPalette       = useUIStore((s) => s.openCommandPalette)
  const toggleNotificationsPanel = useUIStore((s) => s.toggleNotificationsPanel)
  const isNotifOpen              = useUIStore((s) => s.isNotificationsPanelOpen)

  const [avatarMenuOpen, setAvatarMenuOpen]   = useState(false)
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false)
  const avatarMenuRef   = useRef<HTMLDivElement>(null)
  const orgSwitcherRef  = useRef<HTMLDivElement>(null)

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs'],
    queryFn: getOrgsApi,
    enabled: !!isAuthenticated,
    staleTime: 60_000,
  })

  // Fetch notifications on mount to populate unread count + bell badge
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotificationsApi,
    staleTime: 60 * 1000,
  })

  const bellUnread = notifData?.unread_count ?? 0

  // Close avatar menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false)
      }
    }
    if (avatarMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [avatarMenuOpen])

  // Close org switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgSwitcherRef.current && !orgSwitcherRef.current.contains(e.target as Node)) {
        setOrgSwitcherOpen(false)
      }
    }
    if (orgSwitcherOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [orgSwitcherOpen])

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
    ? user.display_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <header className="topbar">
      {/* ── Left: logo + org switcher ────────────────────────── */}
      <div className="topbar-left">
        <div
          className="logo-mark"
          onClick={() => navigate(`/org/${slug}/dashboard`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/org/${slug}/dashboard`)}
          aria-label="Go to dashboard"
        >
          <img
            src="/favicon-32x32.png"
            alt="WorkScribe"
            style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }}
          />
        </div>

        <div ref={orgSwitcherRef} style={{ position: 'relative' }}>
          <button
            className="org-switcher"
            aria-label="Organisation switcher"
            aria-expanded={orgSwitcherOpen}
            onClick={() => setOrgSwitcherOpen((v) => !v)}
          >
            <span className="org-switcher-name">{org.name}</span>
            <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          </button>

          {orgSwitcherOpen && (
            <div className="topbar-dropdown" role="menu" style={{ minWidth: 200, top: 'calc(100% + 8px)', left: 0 }}>
              <div className="topbar-dropdown-header" style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Your workspaces
              </div>
              <div className="topbar-dropdown-divider" />
              {orgs.map((o: any) => (
                <button
                  key={o.slug}
                  className="topbar-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setOrgSwitcherOpen(false)
                    if (o.slug !== slug) navigate(`/org/${o.slug}/dashboard`)
                  }}
                >
                  <div className="avatar avatar-sm" style={{ width: 20, height: 20, fontSize: 10, flexShrink: 0 }}>
                    {o.name?.[0]?.toUpperCase() ?? 'W'}
                  </div>
                  <span style={{ flex: 1, textAlign: 'left' }}>{o.name}</span>
                  {o.slug === slug && <Check size={12} style={{ color: 'var(--brand)' }} />}
                </button>
              ))}
              <div className="topbar-dropdown-divider" />
              <button
                className="topbar-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setOrgSwitcherOpen(false)
                  navigate('/create-org')
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1, marginRight: 2 }}>+</span>
                Create workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Center: search ───────────────────────────────────── */}
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

      {/* ── Right: notif bell + avatar ───────────────────────── */}
      <div className="topbar-right">

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button
            className={`topbar-icon-btn${isNotifOpen ? ' topbar-icon-btn--active' : ''}`}
            onClick={toggleNotificationsPanel}
            aria-label="Notifications"
            aria-expanded={isNotifOpen}
          >
            <Bell size={16} />
            {bellUnread > 0 && <span className="notif-badge" />}
          </button>

          <NotificationsPanel />
        </div>

        {/* Avatar + dropdown */}
        <div ref={avatarMenuRef} style={{ position: 'relative' }}>
          <button
            className="topbar-icon-btn"
            style={{ width: 'auto', padding: '0 4px', gap: 6 }}
            onClick={() => setAvatarMenuOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={avatarMenuOpen}
          >
            <div className="avatar avatar-md">{initials}</div>
          </button>

          {avatarMenuOpen && (
            <div className="topbar-dropdown" role="menu">
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