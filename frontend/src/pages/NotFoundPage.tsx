export default function NotFoundPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'var(--font)',
        color: 'var(--text-secondary)',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 48, fontWeight: 800, color: 'var(--text-muted)' }}>404</span>
      <p>Page not found</p>
    </div>
  )
}