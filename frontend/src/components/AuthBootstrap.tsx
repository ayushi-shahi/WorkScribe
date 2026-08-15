import { useEffect, useRef } from 'react'
import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { clearRefreshToken, getRefreshToken, setRefreshToken } from '@/lib/session'

interface RefreshResult {
  access_token: string
  refresh_token: string
  user?: { id: string; email: string; display_name: string; avatar_url: string | null }
}

/**
 * Restores the session on page load.
 *
 * The access token is deliberately kept in memory only, so a reload wipes it.
 * Without this step the app treated every refresh (F5, deep link, restored tab)
 * as a logout and bounced the user to /login even though the stored refresh
 * token was still valid.
 *
 * Calls the refresh endpoint directly rather than through apiClient so the 401
 * interceptor cannot recurse into its own refresh flow.
 */
export default function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setAuth         = useAuthStore((s) => s.setAuth)
  const setAccessToken  = useAuthStore((s) => s.setAccessToken)
  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const finishBootstrap = useAuthStore((s) => s.finishBootstrap)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)

  // StrictMode double-invokes effects in dev; a rotated refresh token can only
  // be redeemed once, so guard against a second exchange.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      finishBootstrap()
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const res = await axios.post<RefreshResult>(
          `${import.meta.env.VITE_API_URL as string}/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        )
        if (cancelled) return

        setRefreshToken(res.data.refresh_token)
        if (res.data.user) {
          setAuth(res.data.access_token, res.data.user)
        } else {
          setAccessToken(res.data.access_token)
          finishBootstrap()
        }
      } catch {
        if (cancelled) return
        // Expired or revoked — start clean rather than looping on a dead token.
        clearRefreshToken()
        clearAuth()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setAuth, setAccessToken, clearAuth, finishBootstrap])

  // Hold routing until the exchange settles, otherwise ProtectedRoute redirects
  // to /login before the restored token lands.
  if (isBootstrapping) return null

  return <>{children}</>
}
