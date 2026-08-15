import { create } from 'zustand'
import { getRefreshToken } from '@/lib/session'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  /**
   * True while we are exchanging a stored refresh token for a live session on
   * page load. Routing must wait for this: the access token lives in memory
   * only, so immediately after a reload the store looks logged-out even when
   * the session is perfectly valid.
   */
  isBootstrapping: boolean

  setAuth: (token: string, user: AuthUser) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  finishBootstrap: () => void
}

// ── Store ──────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  // Only bootstrap when there is actually a token to restore from.
  isBootstrapping: getRefreshToken() !== null,

  setAuth: (token, user) => {
    set({ accessToken: token, user, isAuthenticated: true, isBootstrapping: false })
  },

  setAccessToken: (token) => {
    set({ accessToken: token })
  },

  clearAuth: () => {
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isBootstrapping: false,
    })
  },

  finishBootstrap: () => {
    set({ isBootstrapping: false })
  },
}))
