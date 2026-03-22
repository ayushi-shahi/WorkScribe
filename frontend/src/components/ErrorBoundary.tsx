import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import type { ReactNode } from 'react'

// ── Fallback UIs ──────────────────────────────────────────────────────────────

function AppFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
      fontFamily: 'var(--font)', background: 'var(--bg)',
      padding: 24, textAlign: 'center',
    }}>
      <AlertTriangle size={48} strokeWidth={1.2} style={{ color: 'var(--amber)', opacity: 0.8 }} />
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
        An unexpected error occurred. Try reloading the page — if the problem persists, contact support.
      </p>
      {import.meta.env.DEV && (
        <pre style={{
          fontSize: 11, color: 'var(--red)', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '12px 16px', maxWidth: 560, overflow: 'auto',
          textAlign: 'left', lineHeight: 1.5, fontFamily: 'var(--font-mono)',
        }}>
          {(error as Error).message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 18px', background: 'var(--brand)',
            color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          Reload page
        </button>
        <button
          onClick={() => { window.location.href = '/' }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 18px', background: 'transparent',
            color: 'var(--text-secondary)', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          <Home size={13} />
          Go home
        </button>
      </div>
    </div>
  )
}

function PageFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%',
      minHeight: 'calc(100vh - var(--topbar-height))',
      gap: 12, fontFamily: 'var(--font)', padding: 24, textAlign: 'center',
    }}>
      <AlertTriangle size={36} strokeWidth={1.2} style={{ color: 'var(--amber)', opacity: 0.7 }} />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        This page ran into a problem
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
        Something went wrong while loading this page.
      </p>
      {import.meta.env.DEV && (
        <pre style={{
          fontSize: 11, color: 'var(--red)', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 14px', maxWidth: 480, overflow: 'auto',
          textAlign: 'left', lineHeight: 1.5, fontFamily: 'var(--font-mono)',
        }}>
          {(error as Error).message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={resetErrorBoundary}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', background: 'var(--brand)',
            color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} />
          Try again
        </button>
        <button
          onClick={() => { window.location.href = '/' }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', background: 'transparent',
            color: 'var(--text-secondary)', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          <Home size={12} />
          Go home
        </button>
      </div>
    </div>
  )
}

// ── Exported wrappers ─────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
  level?: 'app' | 'page'
}

export default function ErrorBoundary({ children, level = 'page' }: Props) {
  const FallbackComponent = level === 'app' ? AppFallback : PageFallback
  return (
    <ReactErrorBoundary FallbackComponent={FallbackComponent}>
      {children}
    </ReactErrorBoundary>
  )
}