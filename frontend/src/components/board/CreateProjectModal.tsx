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

  const derivedKey = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)

  const displayKey = keyTouched ? key : derivedKey

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createProjectApi(slug ?? '', { name, key: displayKey }),
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">New Project</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Project name</label>
            <input
              className="input"
              placeholder="e.g. Mobile App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Key <span style={{ color: 'var(--text-muted)' }}>(used for task IDs like APP-1)</span>
            </label>
            <input
              className="input"
              placeholder="e.g. APP"
              value={displayKey}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim() || !displayKey.trim() || isPending}
            onClick={() => mutate()}
          >
            {isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}