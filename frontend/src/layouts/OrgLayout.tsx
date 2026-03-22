import { Outlet, useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getOrgApi } from '@/api/endpoints/organizations'
import { getMeApi } from '@/api/endpoints/auth'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import TaskPanel from '@/components/panel/TaskPanel'
import CommandPalette from '@/components/CommandPalette'
import ErrorBoundary from '@/components/ErrorBoundary'
import '@/styles/layout.css'

export default function OrgLayout() {
  const { slug }        = useParams<{ slug: string }>()
  const user            = useAuthStore((s) => s.user)
  const setAuth         = useAuthStore((s) => s.setAuth)
  const accessToken     = useAuthStore((s) => s.accessToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useWebSocket(isAuthenticated)

  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await getMeApi()
      if (!user && accessToken) {
        setAuth(accessToken, me)
      }
      return me
    },
    enabled: !user && !!accessToken,
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: org,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => getOrgApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  if (!slug) return <Navigate to="/login" replace />

  if (isLoading) {
    return (
      <div style={{ position: 'relative', height: '100vh', background: 'var(--bg)' }}>
        {/* Topbar skeleton */}
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 'var(--topbar-height)',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-4)',
          gap: 'var(--space-3)',
          zIndex: 'var(--z-topbar)',
        }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 4 }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton" style={{ width: 220, height: 28, borderRadius: 6 }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
        </div>

        {/* Sidebar skeleton */}
        <div style={{
          position: 'fixed',
          top: 'var(--topbar-height)',
          left: 0,
          width: 'var(--sidebar-width)',
          height: 'calc(100vh - var(--topbar-height))',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          {[80, 60, 100, 70, 90, 60].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: `${w}%`, height: 14, borderRadius: 4 }}
            />
          ))}
        </div>

        {/* Main content skeleton */}
        <div style={{
          marginLeft: 'var(--sidebar-width)',
          marginTop: 'var(--topbar-height)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div className="skeleton" style={{ width: 160, height: 20, borderRadius: 6, marginBottom: 12 }} />
          {[90, 75, 82, 60, 70].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: `${w}%`, height: 14, borderRadius: 4 }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !org) return <Navigate to="/login" replace />

  return (
    <div className="app-shell">
      <Topbar org={org} />
      <Sidebar org={org} />
      <main className="main-content">
        <ErrorBoundary level="page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <TaskPanel />
      <CommandPalette />
    </div>
  )
}