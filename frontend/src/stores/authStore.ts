import { create } from 'zustand'

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

  setAuth: (token: string, user: AuthUser) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
}

// ── Store ──────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    set({ accessToken: token, user, isAuthenticated: true })
  },

  setAccessToken: (token) => {
    set({ accessToken: token })
  },

  clearAuth: () => {
    set({ accessToken: null, user: null, isAuthenticated: false })
  },
}))