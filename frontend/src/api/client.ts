import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'

// ── Axios instance ─────────────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

// ── Token getter — reads live from Zustand store ───────────────────────────────
export function setTokenGetter(_fn: () => string | null): void {
  // No-op — kept for authStore import compatibility
  // We now import useAuthStore directly (no circular dep since authStore imports client)
  // The actual token is read inline in the interceptor below
}

// ── Refresh state — shared across all concurrent requests ─────────────────────
let isRefreshing = false
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null): void {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else if (token) {
      resolve(token)
    }
  })
  refreshQueue = []
}

// ── Request interceptor — attach Bearer token ──────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

// ── Response interceptor — silent refresh on 401 ──────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Only handle 401s, and only once per request
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't try to refresh if the failing request IS the refresh endpoint
    if (originalRequest.url?.includes('/auth/refresh')) {
      useAuthStore.getState().clearAuth()
      sessionStorage.removeItem('refresh_token')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // If already refreshing, queue this request and wait
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject })
      }).then((newToken) => {
        originalRequest._retry = true
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(originalRequest)
      })
    }

    // This request is the first 401 — start the refresh
    originalRequest._retry = true
    isRefreshing = true

    const refreshToken = sessionStorage.getItem('refresh_token')

    if (!refreshToken) {
      isRefreshing = false
      processQueue(error, null)
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    try {
      // Call refresh endpoint directly (not through apiClient to avoid intercept loop)
      const res = await axios.post<{ access_token: string }>(
        `${import.meta.env.VITE_API_URL as string}/auth/refresh`,
        { refresh_token: refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      )

      const newToken = res.data.access_token
      useAuthStore.getState().setAccessToken(newToken)

      // Replay all queued requests with the new token
      processQueue(null, newToken)

      // Retry the original request
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
      }
      return apiClient(originalRequest)
    } catch (refreshError) {
      // Refresh failed — clear auth and send to login
      processQueue(refreshError, null)
      useAuthStore.getState().clearAuth()
      sessionStorage.removeItem('refresh_token')
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default apiClient