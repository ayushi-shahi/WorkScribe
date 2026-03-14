// src/pages/ProjectSettingsPage.tsx
import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Settings, Trash2, Plus, X, Check, ShieldOff } from 'lucide-react'
import { getProjectsApi } from '@/api/endpoints/projects'
import { getOrgMembersApi } from '@/api/endpoints/organizations'
import { getLabelsApi, createLabelApi, deleteLabelApi } from '@/api/endpoints/tasks'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import type { Label } from '@/types'
import '@/styles/projectSettings.css'

type Tab = 'general' | 'labels'

const PRESET_COLORS = [
  '#DC2626', '#F97316', '#EAB308', '#16A34A', '#2563EB',
  '#7C3AED', '#DB2777', '#6B7280', '#0891B2', '#9333EA',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="ps-color-grid">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`ps-color-swatch${value === c ? ' ps-color-swatch--active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        >
          {value === c && <Check size={10} strokeWidth={3} color="#fff" />}
        </button>
      ))}
    </div>
  )
}

export default function ProjectSettingsPage() {
  const { slug, key } = useParams<{ slug: string; key: string }>()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<Tab>('labels')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[4])
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showCreate) setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [showCreate])

  // RBAC
  const { data: rawMembers } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => getOrgMembersApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })
  const members = Array.isArray(rawMembers) ? rawMembers : ((rawMembers as any)?.members ?? [])
  const currentMember = members.find((m: any) => m.user_id === currentUser?.id)
  const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  // Project
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', slug],
    queryFn: () => getProjectsApi(slug ?? ''),
    enabled: !!slug,
    staleTime: 60_000,
  })
  const project = projects.find((p) => p.key === key)

  // Labels
  const { data: labels = [], isLoading: labelsLoading } = useQuery<Label[]>({
    queryKey: ['labels', slug, project?.id],
    queryFn: () => getLabelsApi(slug ?? '', project?.id ?? ''),
    enabled: Boolean(slug && project?.id),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLabelApi(slug ?? '', project?.id ?? '', { name: newName.trim(), color: newColor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', slug, project?.id] })
      toast.success(`Label "${newName.trim()}" created`)
      setNewName('')
      setNewColor(PRESET_COLORS[4])
      setShowCreate(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail?.message ?? 'Failed to create label')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => deleteLabelApi(slug ?? '', project?.id ?? '', labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', slug, project?.id] })
      queryClient.invalidateQueries({ queryKey: ['board', slug] })
      toast.success('Label deleted')
    },
    onError: () => toast.error('Failed to delete label'),
  })

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate()
  }

  const handleDelete = (labelId: string, labelName: string) => {
    if (!confirm(`Delete label "${labelName}"? This will remove it from all tasks.`)) return
    deleteMutation.mutate(labelId)
  }

  if (!canManage) {
    return (
      <div className="settings-access-denied">
        <ShieldOff size={32} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Only owners and admins can manage project settings
        </span>
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="ps-root">
      <div className="ps-header">
        <div className="ps-header-title">
          <Settings size={18} color="var(--text-secondary)" />
          <span>{project.name}</span>
          <span className="ps-header-key">{project.key}</span>
        </div>
        <p className="ps-header-sub">Manage project settings and configuration</p>
      </div>

      <div className="ps-layout">
        <nav className="ps-tabs">
          <button
            className={`ps-tab${activeTab === 'general' ? ' ps-tab--active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Settings size={14} />
            General
          </button>
          <button
            className={`ps-tab${activeTab === 'labels' ? ' ps-tab--active' : ''}`}
            onClick={() => setActiveTab('labels')}
          >
            <Tag size={14} />
            Labels
            {labels.length > 0 && <span className="ps-tab-badge">{labels.length}</span>}
          </button>
        </nav>

        <div className="ps-content">

          {activeTab === 'general' && (
            <div className="ps-section">
              <div className="ps-section-header">
                <h2 className="ps-section-title">Project Info</h2>
                <p className="ps-section-sub">Basic information about this project</p>
              </div>
              <div className="ps-info-grid">
                <div className="ps-info-row">
                  <span className="ps-info-label">Name</span>
                  <span className="ps-info-value">{project.name}</span>
                </div>
                <div className="ps-info-row">
                  <span className="ps-info-label">Key</span>
                  <span className="ps-info-value"><code className="ps-mono">{project.key}</code></span>
                </div>
                <div className="ps-info-row">
                  <span className="ps-info-label">Type</span>
                  <span className="ps-info-value" style={{ textTransform: 'capitalize' }}>
                    {project.type ?? 'scrum'}
                  </span>
                </div>
                <div className="ps-info-row">
                  <span className="ps-info-label">Status</span>
                  <span className="ps-status-chip" style={{
                    background: project.is_archived ? 'var(--amber-bg)' : 'var(--green-bg)',
                    color: project.is_archived ? 'var(--amber)' : 'var(--green)',
                  }}>
                    {project.is_archived ? 'Archived' : 'Active'}
                  </span>
                </div>
              </div>
              <p className="ps-general-note">
                Full project editing UI coming soon. To modify project details, contact your org admin.
              </p>
            </div>
          )}

          {activeTab === 'labels' && (
            <div className="ps-section">
              <div className="ps-section-header">
                <div className="ps-section-header-row">
                  <div>
                    <h2 className="ps-section-title">Labels</h2>
                    <p className="ps-section-sub">Categorize and filter tasks on the board</p>
                  </div>
                  {!showCreate && (
                    <button className="ps-btn-primary" onClick={() => setShowCreate(true)}>
                      <Plus size={13} />
                      New Label
                    </button>
                  )}
                </div>
              </div>

              {showCreate && (
                <div className="ps-create-form">
                  <div className="ps-create-form-header">
                    <span className="ps-create-form-title">New Label</span>
                    <button className="ps-icon-btn" onClick={() => { setShowCreate(false); setNewName('') }}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="ps-create-form-body">
                    <div className="ps-field">
                      <label className="ps-field-label">Name</label>
                      <div className="ps-name-row">
                        <span className="ps-label-preview" style={{ background: newColor }}>
                          {newName || 'preview'}
                        </span>
                        <input
                          ref={nameInputRef}
                          className="ps-input"
                          placeholder="e.g. frontend, bug, P1..."
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreate()
                            if (e.key === 'Escape') { setShowCreate(false); setNewName('') }
                          }}
                          maxLength={50}
                        />
                      </div>
                    </div>
                    <div className="ps-field">
                      <label className="ps-field-label">Color</label>
                      <ColorPicker value={newColor} onChange={setNewColor} />
                    </div>
                  </div>
                  <div className="ps-create-form-footer">
                    <button className="ps-btn-cancel" onClick={() => { setShowCreate(false); setNewName('') }}>
                      Cancel
                    </button>
                    <button
                      className="ps-btn-primary"
                      onClick={handleCreate}
                      disabled={!newName.trim() || createMutation.isPending}
                    >
                      {createMutation.isPending ? 'Creating...' : 'Create Label'}
                    </button>
                  </div>
                </div>
              )}

              {labelsLoading ? (
                <div className="ps-labels-loading">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8 }} />
                  ))}
                </div>
              ) : labels.length === 0 && !showCreate ? (
                <div className="ps-labels-empty">
                  <Tag size={28} color="var(--text-muted)" />
                  <p>No labels yet</p>
                  <span>Labels help you categorize tasks on the board</span>
                  <button className="ps-btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 8 }}>
                    <Plus size={13} />
                    Create your first label
                  </button>
                </div>
              ) : (
                <div className="ps-labels-list">
                  {labels.map((label) => (
                    <div key={label.id} className="ps-label-row">
                      <div className="ps-label-left">
                        <span className="ps-label-dot" style={{ background: label.color }} />
                        <span
                          className="ps-label-chip-preview"
                          style={{
                            background: label.color + '22',
                            color: label.color,
                            border: `1px solid ${label.color}44`,
                          }}
                        >
                          {label.name}
                        </span>
                      </div>
                      <div className="ps-label-right">
                        <span className="ps-label-hex">{label.color}</span>
                        <button
                          className="ps-icon-btn ps-icon-btn--danger"
                          onClick={() => handleDelete(label.id, label.name)}
                          disabled={deleteMutation.isPending}
                          title="Delete label"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}