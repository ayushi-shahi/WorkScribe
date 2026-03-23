import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { createProjectApi } from '@/api/endpoints/projects'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
}

export default function CreateProjectModal({ onClose }: Props) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [type, setType] = useState<'kanban' | 'scrum'>('kanban')

  const derivedKey = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)

  const displayKey = keyTouched ? key : derivedKey

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createProjectApi(slug ?? '', { name, key: displayKey, type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', slug] })
      toast.success('Project created')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail?.message ?? 'Failed to create project')
    },
  })

  return (
    <div
      className="ctm-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ctm-modal" role="dialog" aria-modal="true" style={{ width: 440 }}>

        <div className="ctm-header">
          <span className="ctm-header-title">New Project</span>
          <button className="ctm-close-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="ctm-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Project name
            </label>
            <input
              className="ctm-title-input"
              placeholder="e.g. Mobile App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              style={{ fontSize: 14, padding: '8px 0', resize: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Key <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(used for task IDs like APP-1)</span>
            </label>
            <input
              className="ctm-title-input"
              placeholder="e.g. APP"
              value={displayKey}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }}
              style={{ fontSize: 14, padding: '8px 0', resize: 'none', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Type
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['kanban', 'scrum'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${type === t ? 'var(--brand)' : 'var(--border)'}`,
                    background: type === t ? 'var(--brand-light)' : 'var(--surface2)',
                    color: type === t ? 'var(--brand)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'var(--font)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.12s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="ctm-footer">
          <button type="button" className="ctm-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ctm-btn-submit"
            disabled={!name.trim() || !displayKey.trim() || isPending}
            onClick={() => mutate()}
          >
            {isPending ? 'Creating…' : 'Create Project'}
          </button>
        </div>

      </div>
    </div>
  )
}