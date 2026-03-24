import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { forgotPasswordApi } from '@/api/endpoints/auth'
import '@/styles/auth.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const { mutate, isPending } = useMutation({
    mutationFn: forgotPasswordApi,
    onSuccess: () => {
      setSubmitted(true)
    },
    onError: () => {
      // Backend always returns 204 regardless of whether email exists
      // so we only land here on a genuine network/server error
      setSubmitted(true)
    },
  })

  const validate = (): boolean => {
    if (!email.trim()) {
      setFieldError('Email is required')
      return false
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldError('Enter a valid email')
      return false
    }
    setFieldError(null)
    return true
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    mutate(email.trim())
  }

  // Success state — shown after submit regardless of whether email exists
  if (submitted) {
    return (
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark"><img src="/favicon-32x32.png" alt="WorkScribe" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} /></div>
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
              Check your email
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font)',
                lineHeight: 1.6,
              }}
            >
              If an account exists for{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, we've
              sent a password reset link. Check your inbox.
            </p>
            <div className="auth-footer" style={{ marginTop: 8 }}>
              <Link to="/login">Back to sign in</Link>
            </div>
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
          <div className="auth-logo-mark"><img src="/favicon-32x32.png" alt="WorkScribe" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} /></div>
          <span className="auth-logo-name">WorkScribe</span>
        </div>

        {/* Heading */}
        <h1 className="auth-heading">Reset your password</h1>
        <p className="auth-subheading">
          Enter your email and we'll send you a reset link
        </p>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={`auth-input${fieldError ? ' error' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              autoComplete="email"
              autoFocus
            />
            {fieldError && (
              <span className="auth-field-error">{fieldError}</span>
            )}
          </div>

          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
