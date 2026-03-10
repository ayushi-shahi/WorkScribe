// src/components/backlog/CreateSprintModal.tsx
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { createSprintApi } from '@/api/endpoints/tasks'
import toast from 'react-hot-toast'

interface CreateSprintModalProps {
  projectId: string
  onClose: () => void
}

export default function CreateSprintModal({ projectId, onClose }: CreateSprintModalProps) {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const nameRef = useRef<HTMLInputElement>(null)

  const [name, setName]           = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [nameError, setNameError] = useState('')

  // Focus name input on mount
  useEffect(() => { nameRef.current?.focus() }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mutation = useMutation({
    mutationFn: () => {
      const payload: { name: string; start_date?: string; end_date?: string } = {
        name: name.trim(),
      }
      if (startDate) payload.start_date = startDate
      if (endDate)   payload.end_date   = endDate
      return createSprintApi(slug!, projectId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', slug, projectId] })
      toast.success('Sprint created')
      onClose()
    },
    onError: () => {
      toast.error('Failed to create sprint')
    },
  })

  function handleSubmit() {
    if (!name.trim()) {
      setNameError('Sprint name is required')
      nameRef.current?.focus()
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setNameError('End date must be after start date')
      return
    }
    setNameError('')
    mutation.mutate()
  }

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div
        className="csm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csm-title"
      >
        {/* Header */}
        <div className="csm-header">
          <span id="csm-title" className="csm-title">New Sprint</span>
          <button
            type="button"
            className="csm-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="csm-body">
          {/* Name */}
          <div className="csm-field">
            <label className="csm-label" htmlFor="csm-name">
              Sprint name <span className="csm-required">*</span>
            </label>
            <input
              ref={nameRef}
              id="csm-name"
              className={`csm-input${nameError ? ' csm-input--error' : ''}`}
              placeholder="e.g. Sprint 4"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              maxLength={100}
            />
            {nameError && <span className="csm-error-msg">{nameError}</span>}
          </div>

          {/* Date row */}
          <div className="csm-date-row">
            <div className="csm-field">
              <label className="csm-label" htmlFor="csm-start">Start date</label>
              <input
                id="csm-start"
                type="date"
                className="csm-input csm-input--date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="csm-date-sep">→</div>
            <div className="csm-field">
              <label className="csm-label" htmlFor="csm-end">End date</label>
              <input
                id="csm-end"
                type="date"
                className="csm-input csm-input--date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
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
            className="csm-btn csm-btn--primary"
            onClick={handleSubmit}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create Sprint'}
          </button>
        </div>
      </div>
    </div>
  )
}