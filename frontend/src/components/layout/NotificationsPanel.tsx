import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, CheckCheck, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  getNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  type NotificationListResponse,
} from '@/api/endpoints/notifications'
import { useUIStore } from '@/stores/uiStore'
import type { Notification } from '@/types'

export default function NotificationsPanel() {
  const { slug }    = useParams<{ slug: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const isOpen      = useUIStore((s) => s.isNotificationsPanelOpen)
  const close       = useUIStore((s) => s.closeNotificationsPanel)
  const panelRef    = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close()
      }
    }
    if (isOpen) {
      const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
      return () => {
        clearTimeout(t)
        document.removeEventListener('mousedown', handleClick)
      }
    }
  }, [isOpen, close])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, close])

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotificationsApi,
    staleTime: 30 * 1000,
  })

  const { mutate: markRead } = useMutation({
    mutationFn: markNotificationReadApi,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const prev = queryClient.getQueryData<NotificationListResponse>(['notifications'])
      queryClient.setQueryData<NotificationListResponse>(['notifications'], (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((n) => n.id === id ? { ...n, is_read: true } : n),
          unread_count: Math.max(old.unread_count - 1, 0),
        }
      })
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['notifications'], ctx.prev)
    },
  })

  const { mutate: markAllRead } = useMutation({
    mutationFn: markAllNotificationsReadApi,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const prev = queryClient.getQueryData<NotificationListResponse>(['notifications'])
      queryClient.setQueryData<NotificationListResponse>(['notifications'], (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map((n) => ({ ...n, is_read: true })),
          unread_count: 0,
        }
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['notifications'], ctx.prev)
    },
  })

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markRead(n.id)
    if (n.entity_type === 'task' && slug) {
      navigate(`/org/${slug}/projects/APP/board?task=${n.entity_id}`)
    } else if (n.entity_type === 'page' && slug) {
      navigate(`/org/${slug}/wiki`)
    }
    close()
  }

  const notifications = data?.data ?? []
  const unreadCount   = data?.unread_count ?? 0

  if (!isOpen) return null

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      {/* Header */}
      <div className="notif-panel-header">
        <div className="notif-panel-title">
          <Bell size={14} />
          Notifications
          {unreadCount > 0 && (
            <span className="notif-panel-count">{unreadCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {unreadCount > 0 && (
            <button
              className="notif-panel-mark-all"
              onClick={() => markAllRead()}
              title="Mark all as read"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
          <button className="notif-panel-close" onClick={close} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="notif-panel-body">
        {isLoading && (
          <div className="notif-panel-empty">Loading…</div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="notif-panel-empty">
            <Bell size={24} style={{ opacity: 0.3 }} />
            <span>No notifications yet</span>
          </div>
        )}

        {!isLoading && notifications.map((n) => (
          <button
            key={n.id}
            className={`notif-item${n.is_read ? '' : ' notif-item--unread'}`}
            onClick={() => handleNotificationClick(n)}
          >
            {!n.is_read && <span className="notif-item-dot" />}
            <div className="notif-item-content">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-body">{n.body}</div>
              <div className="notif-item-time">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}