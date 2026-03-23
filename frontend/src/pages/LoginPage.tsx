import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { loginApi } from '@/api/endpoints/auth'
import type { ApiError } from '@/types'
import apiClient from '@/api/client'
import { GoogleLogin } from '@react-oauth/google'
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
        const orgsRes = await apiClient.get('/organizations')
        const slug = orgsRes.data?.[0]?.slug
        navigate(slug ? `/org/${slug}/dashboard` : '/create-org', { replace: true })
      } catch {
        navigate('/create-org', { replace: true })
      }
    },
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

        {/* Google OAuth */}
        <div className="auth-google-wrapper">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              if (!credentialResponse.credential) return
              try {
                const res = await apiClient.post('/auth/oauth/google', {
                  id_token: credentialResponse.credential,
                })
                setAuth(res.data.access_token, res.data.user)
                sessionStorage.setItem('refresh_token', res.data.refresh_token)
                const orgsRes = await apiClient.get('/auth/orgs')
                const slug = orgsRes.data?.[0]?.slug
                navigate(slug ? `/org/${slug}/dashboard` : '/create-org', { replace: true })
              } catch {
                // silently ignore — user stays on login page
              }
            }}
            onError={() => console.error('Google login failed')}
            width="360"
            theme="filled_black"
            shape="rectangular"
            text="continue_with"
          />
        </div>

        {/* Footer */}
        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  )
}