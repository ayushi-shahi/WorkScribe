import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '@/stores/authStore'
import { loginApi } from '@/api/endpoints/auth'
import type { ApiError } from '@/types'
import apiClient from '@/api/client'
import '@/styles/auth.css'

interface LocationState {
  from?: { pathname: string }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((s) => s.setAuth)

  const from = (location.state as LocationState | null)?.from?.pathname ?? null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [googleError, setGoogleError] = useState<string | null>(null)

  const { mutate, isPending, error } = useMutation({
    mutationFn: loginApi,
    onSuccess: async (data) => {
      setAuth(data.access_token, data.user)
      sessionStorage.setItem('refresh_token', data.refresh_token)
      if (from && from.startsWith('/org/')) {
        navigate(from, { replace: true })
        return
      }
      try {
        const orgsRes = await apiClient.get('/auth/orgs')
        const slug = orgsRes.data?.[0]?.slug
        navigate(slug ? `/org/${slug}/dashboard` : '/create-org', { replace: true })
      } catch {
        navigate('/create-org', { replace: true })
      }
    },
  })

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setGoogleError(null)
        const res = await apiClient.post('/auth/oauth/google', {
          id_token: tokenResponse.access_token,
        })
        setAuth(res.data.access_token, res.data.user)
        sessionStorage.setItem('refresh_token', res.data.refresh_token)
        const orgsRes = await apiClient.get('/auth/orgs')
        const slug = orgsRes.data?.[0]?.slug
        navigate(slug ? `/org/${slug}/dashboard` : '/create-org', { replace: true })
      } catch {
        setGoogleError('Google sign-in failed. Please try again.')
      }
    },
    onError: () => setGoogleError('Google sign-in failed. Please try again.'),
  })

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {}
    if (!email.trim()) errors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Enter a valid email'
    if (!password) errors.password = 'Password is required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setFieldErrors({})
    mutate({ email: email.trim(), password })
  }

  const apiErrorMessage =
    error instanceof AxiosError
      ? ((error.response?.data as { detail?: ApiError })?.detail?.message ??
        'Invalid email or password')
      : null

  return (
    <div className="auth-root">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark">W</div>
          <span className="auth-logo-name">WorkScribe</span>
        </div>

        {/* Heading */}
        <h1 className="auth-heading">Welcome back</h1>
        <p className="auth-subheading">Sign in to your workspace</p>

        {/* API error banner */}
        {apiErrorMessage && (
          <div className="auth-error-banner" style={{ marginBottom: 16 }}>
            {apiErrorMessage}
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={`auth-input${fieldErrors.email ? ' error' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              autoComplete="email"
              autoFocus
            />
            {fieldErrors.email && (
              <span className="auth-field-error">{fieldErrors.email}</span>
            )}
          </div>

          {/* Password */}
          <div className="auth-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="auth-label" htmlFor="password">
                Password
              </label>
              <Link to="/forgot-password" className="auth-forgot">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              className={`auth-input${fieldErrors.password ? ' error' : ''}`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              autoComplete="current-password"
            />
            {fieldErrors.password && (
              <span className="auth-field-error">{fieldErrors.password}</span>
            )}
          </div>

          {/* Submit */}
          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Google error */}
        {googleError && (
          <div className="auth-error-banner" style={{ marginBottom: 8 }}>
            {googleError}
          </div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          className="auth-btn-google"
          onClick={() => googleLogin()}
          disabled={isPending}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.6-4.7l-6.3-5.2C29.5 35.6 26.9 36 24 36c-5.2 0-9.7-2.9-11.9-7.2l-6.5 5C9.5 40 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.3 5.2C41.5 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

        {/* Footer */}
        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  )
}