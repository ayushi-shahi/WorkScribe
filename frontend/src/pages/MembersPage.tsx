import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, ChevronDown, Crown, Shield, User, X } from 'lucide-react'
import {
  getOrgMembersApi,
  inviteMemberApi,
} from '@/api/endpoints/organizations'
import { useAuthStore } from '@/stores/authStore'
import { getInitials } from '@/lib/taskHelpers'
import toast from 'react-hot-toast'
import '@/styles/members.css'

type Role = 'admin' | 'member'

interface OrgMember {
  user_id: string
  display_name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

const ROLE_META: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  owner: {
    label: 'Owner',
    icon: <Crown size={12} />,
    desc: 'Full access, can delete org',
  },
  admin: {
    label: 'Admin',
    icon: <Shield size={12} />,
    desc: 'Can manage members and projects',
  },
  member: {
    label: 'Member',
    icon: <User size={12} />,
    desc: 'Can create and edit tasks',
  },
}

export default function MembersPage() {
  const { slug }    = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  // Invite form state
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRole, setInviteRole]     = useState<Role>('member')
  const [roleDropOpen, setRoleDropOpen] = useState(false)

  const { data: rawMembers, isLoading } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })

  // API returns { members, total } or plain array — handle both
  const members: OrgMember[] = (() => {
    if (!rawMembers) return []
    if (Array.isArray(rawMembers)) return rawMembers as OrgMember[]
    const r = rawMembers as { members?: OrgMember[] }
    return r.members ?? []
  })()

  // Determine current user's role in this org
  const currentMember = members.find((m) => m.user_id === currentUser?.id)
  const currentRole   = currentMember?.role ?? 'member'
  const canInvite     = currentRole === 'owner' || currentRole === 'admin'
  const canManage     = currentRole === 'owner' || currentRole === 'admin'

  const { mutate: invite, isPending: inviting } = useMutation({
    mutationFn: () =>
      inviteMemberApi(slug ?? '', { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('member')
      queryClient.invalidateQueries({ queryKey: ['members', slug] })
    },
    onError: (err: any) => {
      const code = err?.response?.data?.detail?.code
      if (code === 'ALREADY_MEMBER') {
        toast.error('This person is already a member of the organization')
      } else if (code === 'INVITE_EXISTS') {
        toast.error('A pending invitation already exists for this email')
      } else {
        toast.error('Failed to send invitation')
      }
    },
  })

  function handleInvite() {
    if (!inviteEmail.trim() || inviting) return
    if (!inviteEmail.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    invite()
  }

  return (
    <div className="members-root">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="page-header">
        <Users size={15} style={{ color: 'var(--text-muted)' }} />
        <span className="page-header-title">Members</span>
        <span className="members-count-chip">
          {isLoading ? '…' : members.length}
        </span>
      </div>

      <div className="members-body">

        {/* ── Invite section — only visible to owner/admin ─── */}
        {canInvite && (
          <div className="members-section">
            <div className="members-section-header">
              <h2 className="members-section-title">Invite people</h2>
              <p className="members-section-desc">
                Invite teammates by email. They'll receive a link to join.
              </p>
            </div>

            <div className="members-card">
              <div className="members-invite-row">
                <input
                  className="members-input"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  disabled={inviting}
                />

                {/* Role picker */}
                <div className="members-role-wrap">
                  <button
                    className="members-role-btn"
                    onClick={() => setRoleDropOpen((v) => !v)}
                    disabled={inviting}
                  >
                    {ROLE_META[inviteRole].icon}
                    {ROLE_META[inviteRole].label}
                    <ChevronDown size={11} />
                  </button>
                  {roleDropOpen && (
                    <div className="members-role-dropdown">
                      {(['admin', 'member'] as Role[]).map((r) => (
                        <button
                          key={r}
                          className={`members-role-option${inviteRole === r ? ' members-role-option--active' : ''}`}
                          onClick={() => { setInviteRole(r); setRoleDropOpen(false) }}
                        >
                          <span className="members-role-option-icon">{ROLE_META[r].icon}</span>
                          <span className="members-role-option-body">
                            <span className="members-role-option-label">{ROLE_META[r].label}</span>
                            <span className="members-role-option-desc">{ROLE_META[r].desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="members-invite-btn"
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviting}
                >
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Members list ──────────────────────────────────── */}
        <div className="members-section">
          <div className="members-section-header">
            <h2 className="members-section-title">Team members</h2>
            <p className="members-section-desc">
              People who have access to this organization.
            </p>
          </div>

          <div className="members-card members-card--list">
            {isLoading ? (
              <div className="members-skeleton-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="members-skeleton-row" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="members-empty">
                <Users size={20} style={{ opacity: 0.3 }} />
                No members found
              </div>
            ) : (
              <div className="members-list">
                {members.map((m) => {
                  const isYou    = m.user_id === currentUser?.id
                  const meta     = ROLE_META[m.role] ?? ROLE_META.member
                  // Owner can remove admin/member; admin can only remove member; never remove self or owner
                  const canRemove =
                    canManage &&
                    !isYou &&
                    m.role !== 'owner' &&
                    !(currentRole === 'admin' && m.role === 'admin')

                  return (
                    <div key={m.user_id} className="members-row">
                      {/* Avatar */}
                      <div className="avatar avatar-md members-avatar">
                        {getInitials(m.display_name)}
                      </div>

                      {/* Info */}
                      <div className="members-info">
                        <div className="members-name">
                          {m.display_name}
                          {isYou && <span className="members-you-chip">you</span>}
                        </div>
                        <div className="members-email">{m.email}</div>
                      </div>

                      {/* Role badge */}
                      <div className={`members-role-badge members-role-badge--${m.role}`}>
                        {meta.icon}
                        {meta.label}
                      </div>

                      {/* Joined */}
                      <div className="members-joined">
                        Joined {new Date(m.joined_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </div>

                      {/* Remove button — only shown to owner/admin for eligible members */}
                      {canRemove && (
                        <button
                          className="members-remove-btn"
                          onClick={() => toast.error('Remove member coming soon')}
                          title="Remove member"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}