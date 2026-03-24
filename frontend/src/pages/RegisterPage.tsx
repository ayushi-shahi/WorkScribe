import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { registerApi } from '@/api/endpoints/auth'
import type { ApiError } from '@/types'
import '@/styles/auth.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    display_name?: string
    email?: string
    password?: string
    confirm_password?: string
  }>({})

  const { mutate, isPending, error } = useMutation({
    mutationFn: registerApi,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      sessionStorage.setItem('refresh_token', data.refresh_token)
      // New user → org creation wizard
      navigate('/create-org', { replace: true })
    },
  })

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {}

    if (!displayName.trim()) {
      errors.display_name = 'Name is required'
    } else if (displayName.trim().length < 2) {
      errors.display_name = 'Name must be at least 2 characters'
    }

    if (!email.trim()) {
      errors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Enter a valid email'
    }

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
    if (!validate()) return
    setFieldErrors({})
    mutate({
      display_name: displayName.trim(),
      email: email.trim(),
      password,
    })
  }

  const apiErrorMessage =
    error instanceof AxiosError
      ? ((error.response?.data as { detail?: ApiError })?.detail?.message ??
        'Something went wrong. Please try again.')
      : null

  return (
    <div className="auth-root">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark"><img src="/favicon-32x32.png" alt="WorkScribe" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} /></div>
          <span className="auth-logo-name">WorkScribe</span>
        </div>

        {/* Heading */}
        <h1 className="auth-heading">Create an account</h1>
        <p className="auth-subheading">Start managing your work in one place</p>

        {/* API error banner */}
        {apiErrorMessage && (
          <div className="auth-error-banner" style={{ marginBottom: 16 }}>
            {apiErrorMessage}
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Display name */}
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
              disabled={isPending}
              autoComplete="name"
              autoFocus
            />
            {fieldErrors.display_name && (
              <span className="auth-field-error">{fieldErrors.display_name}</span>
            )}
          </div>

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
            />
            {fieldErrors.email && (
              <span className="auth-field-error">{fieldErrors.email}</span>
            )}
          </div>

          {/* Password */}
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
              disabled={isPending}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span className="auth-field-error">{fieldErrors.password}</span>
            )}
          </div>

          {/* Confirm password */}
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
              disabled={isPending}
              autoComplete="new-password"
            />
            {fieldErrors.confirm_password && (
              <span className="auth-field-error">{fieldErrors.confirm_password}</span>
            )}
          </div>

          {/* Submit */}
          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
