import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import toast from 'react-hot-toast'
import { createOrgApi, checkSlugApi, inviteMemberApi } from '@/api/endpoints/organizations'
import type { ApiError } from '@/types'
import '@/styles/wizard.css'

// ── Slug helpers ───────────────────────────────────────────────────────────────
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
}

// ── Pending invite type ────────────────────────────────────────────────────────
interface PendingInvite {
  email: string
  role: 'admin' | 'member'
}

// ── Step 1: Org name + slug ────────────────────────────────────────────────────
interface Step1Props {
  onComplete: (slug: string) => void
}

function Step1({ onComplete }: Step1Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string }>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { mutate: createOrg, isPending, error } = useMutation({
    mutationFn: createOrgApi,
    onSuccess: (org) => {
      onComplete(org.slug)
    },
  })

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManuallyEdited && name) {
      setSlug(nameToSlug(name))
    }
  }, [name, slugManuallyEdited])

  // Debounced slug availability check
  useEffect(() => {
    if (!slug) {
      setSlugStatus('idle')
      return
    }

    if (!isValidSlug(slug)) {
      setSlugStatus('invalid')
      return
    }

    setSlugStatus('checking')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await checkSlugApi(slug)
      setSlugStatus(result.available ? 'available' : 'taken')
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug])

  const validate = (): boolean => {
    const errors: { name?: string; slug?: string } = {}
    if (!name.trim()) errors.name = 'Organisation name is required'
    else if (name.trim().length < 2) errors.name = 'Name must be at least 2 characters'
    if (!slug) errors.slug = 'Slug is required'
    else if (!isValidSlug(slug)) errors.slug = 'Slug must be 3-30 lowercase letters, numbers or hyphens'
    else if (slugStatus === 'taken') errors.slug = 'This slug is already taken'
    else if (slugStatus === 'checking') errors.slug = 'Still checking availability…'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    createOrg({ name: name.trim(), slug })
  }

  const apiErrorMessage =
    error instanceof AxiosError
      ? ((error.response?.data as { detail?: ApiError })?.detail?.message ??
        'Failed to create organisation.')
      : null

  const slugStatusColor =
    slugStatus === 'available'
      ? 'var(--green)'
      : slugStatus === 'taken' || slugStatus === 'invalid'
      ? 'var(--red)'
      : 'var(--text-muted)'

  const slugStatusText =
    slugStatus === 'checking'
      ? 'Checking…'
      : slugStatus === 'available'
      ? '✓ Available'
      : slugStatus === 'taken'
      ? '✗ Taken'
      : slugStatus === 'invalid'
      ? '✗ Invalid'
      : ''

  const slugRowClass = `wizard-slug-row${
    slugStatus === 'available' ? ' success' : slugStatus === 'taken' || slugStatus === 'invalid' ? ' error' : ''
  }`

  return (
    <form className="wizard-form" onSubmit={handleSubmit} noValidate>
      {apiErrorMessage && (
        <div
          style={{
            background: 'var(--red-bg)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--red)',
            fontFamily: 'var(--font)',
          }}
        >
          {apiErrorMessage}
        </div>
      )}

      {/* Organisation name */}
      <div className="wizard-field">
        <label className="wizard-label" htmlFor="org-name">
          Organisation name
        </label>
        <input
          id="org-name"
          type="text"
          className={`wizard-input${fieldErrors.name ? ' error' : ''}`}
          placeholder="Acme Corp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          autoFocus
        />
        {fieldErrors.name && (
          <span className="wizard-hint error">{fieldErrors.name}</span>
        )}
      </div>

      {/* Slug */}
      <div className="wizard-field">
        <label className="wizard-label" htmlFor="org-slug">
          URL slug
        </label>
        <div className={slugRowClass}>
          <span className="wizard-slug-prefix">workscribe.app/org/</span>
          <input
            id="org-slug"
            type="text"
            className="wizard-slug-input"
            placeholder="acme-corp"
            value={slug}
            onChange={(e) => {
              setSlugManuallyEdited(true)
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }}
            disabled={isPending}
            maxLength={30}
          />
          {slugStatusText && (
            <span
              className="wizard-slug-status"
              style={{ color: slugStatusColor }}
            >
              {slugStatusText}
            </span>
          )}
        </div>
        {fieldErrors.slug ? (
          <span className="wizard-hint error">{fieldErrors.slug}</span>
        ) : (
          <span className="wizard-hint">
            3–30 characters, lowercase letters, numbers and hyphens only
          </span>
        )}
      </div>

      <button
        type="submit"
        className="wizard-btn"
        disabled={isPending || slugStatus === 'taken' || slugStatus === 'checking'}
      >
        {isPending ? 'Creating…' : 'Create organisation →'}
      </button>
    </form>
  )
}

// ── Step 2: Invite members ─────────────────────────────────────────────────────
interface Step2Props {
  orgSlug: string
  onComplete: () => void
}

function Step2({ orgSlug, onComplete }: Step2Props) {
  const navigate = useNavigate()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [isSending, setIsSending] = useState(false)

  const addInvite = () => {
    if (!inviteEmail.trim()) {
      setInviteError('Enter an email address')
      return
    }
    if (!/\S+@\S+\.\S+/.test(inviteEmail)) {
      setInviteError('Enter a valid email')
      return
    }
    if (pendingInvites.some((i) => i.email === inviteEmail.trim())) {
      setInviteError('Already added')
      return
    }
    setPendingInvites((prev) => [...prev, { email: inviteEmail.trim(), role: inviteRole }])
    setInviteEmail('')
    setInviteError(null)
  }

  const removeInvite = (email: string) => {
    setPendingInvites((prev) => prev.filter((i) => i.email !== email))
  }

  const handleFinish = async () => {
    if (pendingInvites.length === 0) {
      onComplete()
      return
    }

    setIsSending(true)
    try {
      await Promise.all(
        pendingInvites.map((invite) =>
          inviteMemberApi(orgSlug, { email: invite.email, role: invite.role })
        )
      )
      toast.success(`${pendingInvites.length} invite${pendingInvites.length > 1 ? 's' : ''} sent`)
      onComplete()
    } catch {
      toast.error('Some invites failed to send. You can invite members later.')
      onComplete()
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="wizard-form">
      {/* Pending invites list */}
      {pendingInvites.length > 0 && (
        <div className="wizard-invite-list">
          {pendingInvites.map((invite) => (
            <div key={invite.email} className="wizard-invite-item">
              <span className="wizard-invite-item-email">{invite.email}</span>
              <span className="wizard-invite-item-role">{invite.role}</span>
              <button
                type="button"
                className="wizard-invite-item-remove"
                onClick={() => removeInvite(invite.email)}
                aria-label={`Remove ${invite.email}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add invite row */}
      <div className="wizard-field">
        <label className="wizard-label">Invite by email</label>
        <div className="wizard-add-invite-row">
          <input
            type="email"
            className={`wizard-input${inviteError ? ' error' : ''}`}
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => {
              setInviteEmail(e.target.value)
              setInviteError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addInvite()
              }
            }}
            autoFocus
          />
          <select
            className="wizard-role-select"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            className="wizard-btn-secondary"
            style={{ height: 38, padding: '0 16px', whiteSpace: 'nowrap' }}
            onClick={addInvite}
          >
            Add
          </button>
        </div>
        {inviteError && (
          <span className="wizard-hint error">{inviteError}</span>
        )}
        <span className="wizard-hint">Press Enter or click Add. You can add multiple.</span>
      </div>

      <div className="wizard-btn-row">
        <button
          type="button"
          className="wizard-btn"
          onClick={handleFinish}
          disabled={isSending}
        >
          {isSending
            ? 'Sending invites…'
            : pendingInvites.length > 0
            ? `Send ${pendingInvites.length} invite${pendingInvites.length > 1 ? 's' : ''} →`
            : 'Go to dashboard →'}
        </button>
      </div>

      <div className="wizard-skip">
        <button type="button" onClick={() => navigate(`/org/${orgSlug}/dashboard`)}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

// ── Main wizard page ───────────────────────────────────────────────────────────
export default function OrgCreatePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

  const handleStep1Complete = (slug: string) => {
    setCreatedSlug(slug)
    setStep(2)
  }

  const handleStep2Complete = () => {
    if (createdSlug) {
      navigate(`/org/${createdSlug}/dashboard`, { replace: true })
    }
  }

  return (
    <div className="wizard-root">
      <div className="wizard-card">
        {/* Logo */}
        <div className="wizard-logo">
          <div className="wizard-logo-mark">W</div>
          <span className="wizard-logo-name">WorkScribe</span>
        </div>

        {/* Step indicators */}
        <div className="wizard-steps">
          <div className={`wizard-step ${step === 1 ? 'active' : 'done'}`}>
            <div className="wizard-step-dot">{step > 1 ? '✓' : '1'}</div>
            <span>Organisation</span>
          </div>
          <div className="wizard-step-divider" />
          <div className={`wizard-step ${step === 2 ? 'active' : 'idle'}`}>
            <div className="wizard-step-dot">2</div>
            <span>Invite team</span>
          </div>
        </div>

        {/* Step content */}
        {step === 1 ? (
          <>
            <h1 className="wizard-heading">Create your organisation</h1>
            <p className="wizard-subheading">
              This is your team's shared workspace for tasks and docs.
            </p>
            <Step1 onComplete={handleStep1Complete} />
          </>
        ) : (
          <>
            <h1 className="wizard-heading">Invite your team</h1>
            <p className="wizard-subheading">
              Add teammates to <strong style={{ color: 'var(--text-primary)' }}>{createdSlug}</strong>.
              You can always do this later.
            </p>
            <Step2 orgSlug={createdSlug ?? ''} onComplete={handleStep2Complete} />
          </>
        )}
      </div>
    </div>
  )
}