import { Outlet, useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getOrgApi } from '@/api/endpoints/organizations'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import TaskPanel from '@/components/panel/TaskPanel'
import '@/styles/layout.css'

export default function OrgLayout() {
  const { slug } = useParams<{ slug: string }>()

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font)',
          fontSize: 13,
        }}
      >
        Loading...
      </div>
    )
  }

  if (isError || !org) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      <Topbar org={org} />
      <Sidebar org={org} />
      <main className="main-content">
        <Outlet />
      </main>
      <TaskPanel />
    </div>
  )
}