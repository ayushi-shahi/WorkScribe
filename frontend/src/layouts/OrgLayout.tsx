import { Outlet } from 'react-router-dom'

export default function OrgLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font)' }}>
      {/* Sidebar — built in C2 */}
      <div
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        Sidebar (C2)
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar — built in C3 */}
        <div
          style={{
            height: 'var(--topbar-height)',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--space-4)',
            color: 'var(--text-muted)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Topbar (C3)
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}