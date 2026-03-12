import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import type { Notification } from '@/types'
import type { NotificationListResponse } from '@/api/endpoints/notifications'

const WS_BASE = (import.meta.env.VITE_API_URL as string)
  .replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws'))
  .replace(/\/api\/v1\/?$/, '')

const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY     = 30000
const MAX_RECONNECT_ATTEMPTS  = 10

interface WSNotificationMessage {
  type: 'notification'
  data: Notification
}

type WSMessage = WSNotificationMessage

export function useWebSocket(enabled: boolean = true): void {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)

  const wsRef             = useRef<WebSocket | null>(null)
  const reconnectDelay    = useRef(INITIAL_RECONNECT_DELAY)
  const reconnectAttempts = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef      = useRef(true)
  const tokenRef          = useRef<string | null>(accessToken)

  useEffect(() => {
    tokenRef.current = accessToken
  }, [accessToken])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!isMountedRef.current) return
    if (!tokenRef.current)     return

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    const url = `${WS_BASE}/api/v1/ws?token=${tokenRef.current}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMountedRef.current) { ws.close(); return }
      reconnectDelay.current    = INITIAL_RECONNECT_DELAY
      reconnectAttempts.current = 0
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return
      try {
        const msg = JSON.parse(event.data as string) as WSMessage

        if (msg.type === 'notification') {
          const notification = msg.data

          // Prepend to notifications cache + bump unread_count
          queryClient.setQueryData<NotificationListResponse>(
            ['notifications'],
            (old) => {
              if (!old) return old
              return {
                ...old,
                data: [notification, ...old.data],
                total: old.total + 1,
                unread_count: old.unread_count + 1,
              }
            }
          )
        }
      } catch {
        // Malformed message — ignore
      }
    }

    ws.onerror = () => {
      // onclose fires after onerror — reconnect logic lives there
    }

    ws.onclose = (event: CloseEvent) => {
      if (!isMountedRef.current) return
      wsRef.current = null

      // 1000 = intentional close (logout/unmount) — don't reconnect
      if (event.code === 1000) return
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) return

      reconnectAttempts.current += 1
      reconnectTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          MAX_RECONNECT_DELAY
        )
        connect()
      }, reconnectDelay.current)
    }
  }, [queryClient])

  useEffect(() => {
    isMountedRef.current = true

    if (!enabled || !accessToken) return

    connect()

    return () => {
      isMountedRef.current = false
      clearReconnectTimer()
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close(1000, 'component unmounted')
        wsRef.current = null
      }
    }
    // accessToken in deps so socket reconnects after silent token refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, accessToken])
}