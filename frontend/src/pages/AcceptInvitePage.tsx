import { useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { getInviteDetailsApi, acceptInviteApi, loginApi } from '@/api/endpoints/auth'
import type { ApiError } from '@/types'
import '@/styles/auth.css'

type Mode = 'loading' | 'error' | 'new-user' | 'existing-user'

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [mode, setMode] = useState<Mode>('loading')

  // Form state — new user
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Form state — existing user login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Fetch invite details
  const {
    data: invite,
    isError: inviteError,
    error: inviteQueryError,
  } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInviteDetailsApi(token ?? ''),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  })

  // Set mode once invite loads
  useState(() => {
    if (invite) {
      if (isAuthenticated) {
        setMode('existing-user')
      } else {
        setMode('new-user')
        setLoginEmail(invite.email)
      }
    }
    if (inviteError) setMode('error')
  })

  // Derive mode from query state
  const resolvedMode: Mode = inviteError
    ? 'error'
    : !invite
    ? 'loading'
    : isAuthenticated
    ? 'existing-user'
    : 'new-user'

  // Accept invite mutation (for already-logged-in users)
  const { mutate: acceptDirect, isPending: isAccepting } = useMutation({
    mutationFn: () => acceptInviteApi(token ?? '', {}),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      sessionStorage.setItem('refresh_token', data.refresh_token)
      navigate(`/org/${invite?.org_slug ?? ''}/dashboard`, { replace: true })
    },
  })

  // Register + accept mutation (for new users)
  const { mutate: acceptAsNew, isPending: isRegistering, error: registerError } = useMutation({
    mutationFn: () =>
      acceptInviteApi(token ?? '', {
        display_name: displayName.trim(),
        password,
      }),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      sessionStorage.setItem('refresh_token', data.refresh_token)
      navigate(`/org/${invite?.org_slug ?? ''}/dashboard`, { replace: true })
    },
  })

  // Login then accept mutation (for existing users not yet logged in)
  const { mutate: loginAndAccept, isPending: isLoggingIn, error: loginError } = useMutation({
    mutationFn: async () => {
      // First login
      const loginData = await loginApi({ email: loginEmail, password: loginPassword })
      setAuth(loginData.access_token, loginData.user)
      sessionStorage.setItem('refresh_token', loginData.refresh_token)
      // Then accept
      return acceptInviteApi(token ?? '', {})
    },
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      sessionStorage.setItem('refresh_token', data.refresh_token)
      navigate(`/org/${invite?.org_slug ?? ''}/dashboard`, { replace: true })
    },
  })

  const validateNewUser = (): boolean => {
    const errors: Record<string, string> = {}
    if (!displayName.trim()) errors.display_name = 'Name is required'
    else if (displayName.trim().length < 2) errors.display_name = 'At least 2 characters'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'At least 8 characters'
    else if (!/\d/.test(password)) errors.password = 'Must contain a number'
    if (!confirmPassword) errors.confirm_password = 'Please confirm password'
    else if (password !== confirmPassword) errors.confirm_password = 'Passwords do not match'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateLogin = (): boolean => {
    const errors: Record<string, string> = {}
    if (!loginEmail.trim()) errors.login_email = 'Email is required'
    if (!loginPassword) errors.login_password = 'Password is required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleNewUserSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validateNewUser()) return
    setFieldErrors({})
    acceptAsNew()
  }

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validateLogin()) return
    setFieldErrors({})
    loginAndAccept()
  }

  const apiError = (err: unknown): string | null => {
    if (err instanceof AxiosError) {
      return (
        (err.response?.data as { detail?: ApiError })?.detail?.message ??
        'Something went wrong.'
      )
    }
    return null
  }

  const inviteErrorMessage =
    inviteQueryError instanceof AxiosError
      ? inviteQueryError.response?.status === 404
        ? 'This invitation link is invalid or has already been used.'
        : inviteQueryError.response?.status === 410
        ? 'This invitation has expired. Ask your team admin to send a new one.'
        : 'Failed to load invitation details.'
      : null

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (resolvedMode === 'loading') {
    return (
      <div className="auth-root">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-logo" style={{ justifyContent: 'center' }}>
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font)', fontSize: 13 }}>
            Loading invitation…
          </p>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (resolvedMode === 'error') {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>
          <div className="auth-error-banner" style={{ marginBottom: 16 }}>
            {inviteErrorMessage ?? 'Invalid invitation link.'}
          </div>
          <div className="auth-footer">
            <Link to="/login">Go to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Already logged in — one-click accept ─────────────────────────────────────
  if (resolvedMode === 'existing-user' && invite) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>

          <h1 className="auth-heading">You're invited</h1>
          <p className="auth-subheading">
            Join <strong style={{ color: 'var(--text-primary)' }}>{invite.org_name}</strong> as{' '}
            <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
              {invite.role}
            </strong>
          </p>

          <div
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font)',
            }}
          >
            Invited by{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{invite.inviter_name}</strong>
          </div>

          <button
            className="auth-btn"
            onClick={() => acceptDirect()}
            disabled={isAccepting}
            style={{ width: '100%' }}
          >
            {isAccepting ? 'Joining…' : `Join ${invite.org_name}`}
          </button>

          <div className="auth-footer">
            Wrong account?{' '}
            <Link to="/login">Sign in with a different account</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── New user — register + accept ─────────────────────────────────────────────
  if (resolvedMode === 'new-user' && invite) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>

          <h1 className="auth-heading">You're invited to {invite.org_name}</h1>
          <p className="auth-subheading">
            Create your account to join as{' '}
            <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
              {invite.role}
            </strong>
          </p>

          {/* Toggle: new user / existing user */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 20,
              background: 'var(--surface2)',
              borderRadius: 'var(--radius-sm)',
              padding: 4,
            }}
          >
            {(['new-user', 'existing-user'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  height: 30,
                  border: 'none',
                  borderRadius: 4,
                  fontFamily: 'var(--font)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: mode === m ? 'var(--surface3)' : 'transparent',
                  color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'new-user' ? 'Create account' : 'I have an account'}
              </button>
            ))}
          </div>

          {/* New user form */}
          {mode === 'new-user' && (
            <>
              {apiError(registerError) && (
                <div className="auth-error-banner" style={{ marginBottom: 16 }}>
                  {apiError(registerError)}
                </div>
              )}
              <form className="auth-form" onSubmit={handleNewUserSubmit} noValidate>
                <div className="auth-field">
                  <label className="auth-label">Email</label>
                  <input
                    type="email"
                    className="auth-input"
                    value={invite.email}
                    disabled
                    style={{ opacity: 0.6 }}
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="display_name">
                    Full name
                  </label>
                  <input
                    id="display_name"
                    type="text"
                    className={`auth-input${fieldErrors.display_name ? ' error' : ''}`}
                    placeholder="Sam Chen"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isRegistering}
                    autoFocus
                  />
                  {fieldErrors.display_name && (
                    <span className="auth-field-error">{fieldErrors.display_name}</span>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className={`auth-input${fieldErrors.password ? ' error' : ''}`}
                    placeholder="Min 8 chars, 1 number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isRegistering}
                    autoComplete="new-password"
                  />
                  {fieldErrors.password && (
                    <span className="auth-field-error">{fieldErrors.password}</span>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="confirm_password">
                    Confirm password
                  </label>
                  <input
                    id="confirm_password"
                    type="password"
                    className={`auth-input${fieldErrors.confirm_password ? ' error' : ''}`}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isRegistering}
                    autoComplete="new-password"
                  />
                  {fieldErrors.confirm_password && (
                    <span className="auth-field-error">{fieldErrors.confirm_password}</span>
                  )}
                </div>

                <button type="submit" className="auth-btn" disabled={isRegistering}>
                  {isRegistering ? 'Creating account…' : `Join ${invite.org_name}`}
                </button>
              </form>
            </>
          )}

          {/* Existing user login form */}
          {mode === 'existing-user' && (
            <>
              {apiError(loginError) && (
                <div className="auth-error-banner" style={{ marginBottom: 16 }}>
                  {apiError(loginError)}
                </div>
              )}
              <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="login_email">
                    Email
                  </label>
                  <input
                    id="login_email"
                    type="email"
                    className={`auth-input${fieldErrors.login_email ? ' error' : ''}`}
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={isLoggingIn}
                    autoFocus
                  />
                  {fieldErrors.login_email && (
                    <span className="auth-field-error">{fieldErrors.login_email}</span>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="login_password">
                    Password
                  </label>
                  <input
                    id="login_password"
                    type="password"
                    className={`auth-input${fieldErrors.login_password ? ' error' : ''}`}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={isLoggingIn}
                    autoComplete="current-password"
                  />
                  {fieldErrors.login_password && (
                    <span className="auth-field-error">{fieldErrors.login_password}</span>
                  )}
                </div>

                <button type="submit" className="auth-btn" disabled={isLoggingIn}>
                  {isLoggingIn ? 'Signing in…' : `Sign in and join ${invite.org_name}`}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}