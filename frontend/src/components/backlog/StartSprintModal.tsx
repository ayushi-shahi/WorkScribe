// src/components/backlog/StartSprintModal.tsx
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap } from 'lucide-react'
import { startSprintApi } from '@/api/endpoints/tasks'
import toast from 'react-hot-toast'
import type { Sprint } from '@/types'

interface StartSprintModalProps {
  sprint: Sprint
  taskCount: number
  onClose: () => void
}

export default function StartSprintModal({ sprint, taskCount, onClose }: StartSprintModalProps) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mutation = useMutation({
    mutationFn: () => startSprintApi(sprint.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', slug] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
      queryClient.invalidateQueries({ queryKey: ['board', slug] })
      toast.success(`${sprint.name} is now active`)
      onClose()
    },
    onError: (err: unknown) => {
      // Backend returns 409 if another sprint is already active
      const msg =
        err instanceof Error ? err.message : 'Failed to start sprint'
      toast.error(msg)
    },
  })

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div
        className="csm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssm-title"
      >
        {/* Header */}
        <div className="csm-header">
          <span id="ssm-title" className="csm-title">Start Sprint</span>
          <button type="button" className="csm-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="csm-body">
          <div className="ssm-sprint-info">
            <div className="ssm-sprint-name">{sprint.name}</div>
            {(sprint.start_date || sprint.end_date) && (
              <div className="ssm-sprint-dates">
                {formatDate(sprint.start_date)} → {formatDate(sprint.end_date)}
              </div>
            )}
          </div>

          <p className="ssm-description">
            Starting this sprint will make it the active sprint for this project.
            {taskCount > 0
              ? ` It contains ${taskCount} task${taskCount !== 1 ? 's' : ''}.`
              : ' It has no tasks yet — you can add them after starting.'}
          </p>

          <div className="ssm-warning">
            Only one sprint can be active at a time. If another sprint is already
            active, this action will fail.
          </div>
        </div>

        {/* Footer */}
        <div className="csm-footer">
          <button
            type="button"
            className="csm-btn csm-btn--secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="csm-btn csm-btn--start"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Zap size={13} />
            {mutation.isPending ? 'Starting…' : 'Start Sprint'}
          </button>
        </div>
      </div>
    </div>
  )
}