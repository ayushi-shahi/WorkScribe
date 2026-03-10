// src/components/backlog/CompleteSprintModal.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CheckCircle } from 'lucide-react'
import { completeSprintApi } from '@/api/endpoints/tasks'
import toast from 'react-hot-toast'
import type { Sprint } from '@/types'

interface CompleteSprintModalProps {
  sprint: Sprint
  incompleteTasks: number
  plannedSprints: Sprint[]
  onClose: () => void
}

export default function CompleteSprintModal({
  sprint,
  incompleteTasks,
  plannedSprints,
  onClose,
}: CompleteSprintModalProps) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  // '' means move to backlog; a sprint UUID means move to that sprint
  const [moveToSprintId, setMoveToSprintId] = useState<string>('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mutation = useMutation({
    mutationFn: () =>
      completeSprintApi(sprint.id, {
        move_incomplete_to: moveToSprintId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', slug] })
      queryClient.invalidateQueries({ queryKey: ['backlog', slug] })
      queryClient.invalidateQueries({ queryKey: ['backlog-tasks', slug] })
      queryClient.invalidateQueries({ queryKey: ['board', slug] })
      toast.success(`${sprint.name} completed`)
      onClose()
    },
    onError: () => toast.error('Failed to complete sprint'),
  })

  const doneTasks = sprint  // we receive incompleteTasks count directly

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div
        className="csm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="com-title"
      >
        {/* Header */}
        <div className="csm-header">
          <span id="com-title" className="csm-title">Complete Sprint</span>
          <button type="button" className="csm-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="csm-body">
          <div className="ssm-sprint-info">
            <div className="ssm-sprint-name">{sprint.name}</div>
          </div>

          {incompleteTasks === 0 ? (
            <p className="ssm-description">
              All tasks in this sprint are done. Completing it will mark the sprint
              as finished.
            </p>
          ) : (
            <>
              <p className="ssm-description">
                This sprint has{' '}
                <strong style={{ color: 'var(--amber)' }}>
                  {incompleteTasks} incomplete task{incompleteTasks !== 1 ? 's' : ''}
                </strong>
                . Where should they go?
              </p>

              <div className="com-move-options">
                <label className="com-option">
                  <input
                    type="radio"
                    name="move-to"
                    value=""
                    checked={moveToSprintId === ''}
                    onChange={() => setMoveToSprintId('')}
                  />
                  <span className="com-option-label">Move to Backlog</span>
                </label>

                {plannedSprints.map((s) => (
                  <label key={s.id} className="com-option">
                    <input
                      type="radio"
                      name="move-to"
                      value={s.id}
                      checked={moveToSprintId === s.id}
                      onChange={() => setMoveToSprintId(s.id)}
                    />
                    <span className="com-option-label">
                      Move to <strong>{s.name}</strong>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
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
            className="csm-btn csm-btn--complete"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <CheckCircle size={13} />
            {mutation.isPending ? 'Completing…' : 'Complete Sprint'}
          </button>
        </div>
      </div>
    </div>
  )
}