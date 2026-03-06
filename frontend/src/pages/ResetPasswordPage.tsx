import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { resetPasswordApi } from '@/api/endpoints/auth'
import type { ApiError } from '@/types'
import '@/styles/auth.css'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string
    confirm_password?: string
  }>({})
  const [success, setSuccess] = useState(false)

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ password }: { password: string }) =>
      resetPasswordApi(token, password),
    onSuccess: () => {
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    },
  })

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {}

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    } else if (!/\d/.test(password)) {
      errors.password = 'Password must contain at least one number'
    }

    if (!confirmPassword) {
      errors.confirm_password = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      errors.confirm_password = 'Passwords do not match'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!validate()) return
    setFieldErrors({})
    mutate({ password })
  }

  const apiErrorMessage =
    error instanceof AxiosError
      ? ((error.response?.data as { detail?: ApiError })?.detail?.message ??
        'Reset link is invalid or has expired.')
      : null

  // No token in URL
  if (!token) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>
          <div className="auth-error-banner" style={{ marginBottom: 16 }}>
            Invalid reset link. Please request a new one.
          </div>
          <div className="auth-footer">
            <Link to="/forgot-password">Request new link</Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">W</div>
            <span className="auth-logo-name">WorkScribe</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: '8px 0 16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--green-bg)',
                border: '1px solid var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              ✓
            </div>
            <h1 className="auth-heading" style={{ marginBottom: 0 }}>
              Password updated
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font)',
              }}
            >
              Redirecting you to sign in…
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark">W</div>
          <span className="auth-logo-name">WorkScribe</span>
        </div>

        {/* Heading */}
        <h1 className="auth-heading">Choose a new password</h1>
        <p className="auth-subheading">Must be at least 8 characters with one number</p>

        {/* API error banner */}
        {apiErrorMessage && (
          <div className="auth-error-banner" style={{ marginBottom: 16 }}>
            {apiErrorMessage}
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* New password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              className={`auth-input${fieldErrors.password ? ' error' : ''}`}
              placeholder="Min 8 chars, 1 number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              autoComplete="new-password"
              autoFocus
            />
            {fieldErrors.password && (
              <span className="auth-field-error">{fieldErrors.password}</span>
            )}
          </div>

          {/* Confirm password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm_password">
              Confirm new password
            </label>
            <input
              id="confirm_password"
              type="password"
              className={`auth-input${fieldErrors.confirm_password ? ' error' : ''}`}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isPending}
              autoComplete="new-password"
            />
            {fieldErrors.confirm_password && (
              <span className="auth-field-error">{fieldErrors.confirm_password}</span>
            )}
          </div>

          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}