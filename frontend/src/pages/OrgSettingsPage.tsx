import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Check, X, Loader, ShieldOff } from 'lucide-react'
import { getOrgApi, updateOrgApi, checkSlugApi, getOrgMembersApi } from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import '@/styles/settings.css'

interface OrgMember {
  user_id: string
  role: 'owner' | 'admin' | 'member'
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function OrgSettingsPage() {
  const { slug }    = useParams<{ slug: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  // ── Fetch current user's role ──────────────────────────────
  const { data: rawMembers, isLoading: membersLoading } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  const members: OrgMember[] = (() => {
    if (!rawMembers) return []
    if (Array.isArray(rawMembers)) return rawMembers as OrgMember[]
    const r = rawMembers as { members?: OrgMember[] }
    return r.members ?? []
  })()

  const currentMember  = members.find((m) => m.user_id === currentUser?.id)
  const currentRole    = currentMember?.role ?? null
  const isOwner        = currentRole === 'owner'
  const isAdmin        = currentRole === 'admin'
  const canEditGeneral = isOwner || isAdmin
  const canDelete      = isOwner

  // ── Fetch org data ─────────────────────────────────────────
  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => getOrgApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  const [name, setName]               = useState('')
  const [newSlug, setNewSlug]         = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    if (org) {
      setName(org.name)
      setNewSlug(org.slug)
    }
  }, [org])

  // ── Slug availability check ────────────────────────────────
  const debouncedSlug = useDebounce(newSlug, 500)
  const slugChanged   = debouncedSlug !== org?.slug

  const { data: slugCheck, isFetching: checkingSlug } = useQuery({
    queryKey: ['slug-check', debouncedSlug],
    queryFn: () => checkSlugApi(debouncedSlug),
    enabled: slugTouched && slugChanged && debouncedSlug.length >= 3,
    staleTime: 10_000,
  })

  const slugAvailable = !slugChanged || (slugCheck?.available ?? false)
  const slugError = slugTouched && slugChanged && slugCheck?.available === false
    ? 'This slug is already taken'
    : slugTouched && newSlug.length > 0 && newSlug.length < 3
    ? 'Slug must be at least 3 characters'
    : null

  // ── Save mutation ──────────────────────────────────────────
  const isDirty = name !== org?.name || newSlug !== org?.slug

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => updateOrgApi(slug ?? '', {
      name:  name !== org?.name    ? name    : undefined,
      slug:  newSlug !== org?.slug ? newSlug : undefined,
    }),
    onSuccess: (updated) => {
      toast.success('Settings saved')
      queryClient.setQueryData(['org', slug], updated)
      queryClient.setQueryData(['org', updated.slug], updated)
      if (updated.slug !== slug) {
        navigate(`/org/${updated.slug}/settings`, { replace: true })
      }
    },
    onError: () => {
      toast.error('Failed to save settings')
    },
  })

  function handleSave() {
    if (!isDirty || slugError || saving) return
    if (slugChanged && !slugAvailable) return
    save()
  }

  const canSave = canEditGeneral && isDirty && !slugError && !checkingSlug && slugAvailable && !saving

  // ── Loading state ──────────────────────────────────────────
  if (orgLoading || membersLoading) {
    return (
      <div className="settings-root">
        <div className="page-header">
          <Settings size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="page-header-title">Settings</span>
        </div>
        <div className="settings-body">
          <div className="settings-skeleton" />
        </div>
      </div>
    )
  }

  // ── Access guard ───────────────────────────────────────────
  if (currentRole === 'member') {
    return (
      <div className="settings-root">
        <div className="page-header">
          <Settings size={15} style={{ color: 'var(--text-muted)' }} />
          <span className="page-header-title">Settings</span>
        </div>
        <div className="settings-body">
          <div className="settings-card settings-access-denied">
            <ShieldOff size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <h2 className="settings-section-title">Access restricted</h2>
            <p className="settings-section-desc">
              Only owners and admins can manage organization settings.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-root">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="page-header">
        <Settings size={15} style={{ color: 'var(--text-muted)' }} />
        <span className="page-header-title">Settings</span>
      </div>

      <div className="settings-body">

        {/* ── General ───────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-header">
            <h2 className="settings-section-title">General</h2>
            <p className="settings-section-desc">
              Basic information about your organization.
            </p>
          </div>

          <div className="settings-card">

            <div className="settings-field">
              <label className="settings-label" htmlFor="org-name">
                Organization name
              </label>
              <input
                id="org-name"
                className="settings-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Organization"
                maxLength={80}
                disabled={saving || !canEditGeneral}
              />
              <p className="settings-hint">
                This is your organization's display name.
              </p>
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="org-slug">
                URL slug
              </label>
              <div className="settings-slug-wrap">
                <span className="settings-slug-prefix">workscribe.app/org/</span>
                <div className="settings-slug-input-wrap">
                  <input
                    id="org-slug"
                    className={`settings-input settings-slug-input${slugError ? ' settings-input--error' : ''}`}
                    value={newSlug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }}
                    placeholder="my-org"
                    maxLength={30}
                    disabled={saving || !canEditGeneral}
                  />
                  <span className="settings-slug-status">
                    {checkingSlug && <Loader size={13} className="settings-slug-spinner" />}
                    {!checkingSlug && slugTouched && slugChanged && slugCheck?.available === true && (
                      <Check size={13} style={{ color: 'var(--green)' }} />
                    )}
                    {!checkingSlug && slugError && (
                      <X size={13} style={{ color: 'var(--red)' }} />
                    )}
                  </span>
                </div>
              </div>
              {slugError ? (
                <p className="settings-hint settings-hint--error">{slugError}</p>
              ) : (
                <p className="settings-hint">
                  Only lowercase letters, numbers, and hyphens. Used in all URLs.
                </p>
              )}
            </div>

            <div className="settings-actions">
              <button
                className="settings-save-btn"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saving ? (
                  <><Loader size={13} className="settings-slug-spinner" /> Saving…</>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Danger zone — owner only ──────────────────────── */}
        {canDelete && (
          <div className="settings-section">
            <div className="settings-section-header">
              <h2 className="settings-section-title settings-section-title--danger">
                Danger zone
              </h2>
              <p className="settings-section-desc">
                Irreversible actions. Proceed with caution.
              </p>
            </div>

            <div className="settings-card settings-card--danger">
              <div className="settings-danger-row">
                <div>
                  <div className="settings-danger-label">Delete organization</div>
                  <div className="settings-danger-desc">
                    Permanently delete this organization and all its data. This cannot be undone.
                  </div>
                </div>
                <button
                  className="settings-danger-btn"
                  onClick={() => toast.error('Delete org is not available in this version.')}
                >
                  Delete organization
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}