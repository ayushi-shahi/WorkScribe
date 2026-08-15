import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { clearRefreshToken, getRefreshToken, setRefreshToken } from '@/lib/session'

// ── Axios instance ─────────────────────────────────────────────────────────────
// Timeout has to absorb a free-tier cold start: hosts like Render spin the
// service down after ~15 min idle, and the next request waits for the container
// to boot. The old 15s ceiling aborted that request, so the first visit after a
// quiet period always failed even though the backend was coming up fine.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
})

// Shape returned by POST /auth/refresh. `user` is present on current backends;
// typed optional so an older deployment degrades instead of blanking the store.
interface RefreshResult {
  access_token: string
  refresh_token: string
  user?: { id: string; email: string; display_name: string; avatar_url: string | null }
}

/**
 * Send the user to the login screen.
 *
 * Guarded: assigning window.location.href while already on /login triggers a
 * full page reload, and a failing request on the login screen itself could
 * reload the page in a loop.
 */
function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
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
      clearRefreshToken()
      redirectToLogin()
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

    const refreshToken = getRefreshToken()

    if (!refreshToken) {
      isRefreshing = false
      processQueue(error, null)
      useAuthStore.getState().clearAuth()
      redirectToLogin()
      return Promise.reject(error)
    }

    try {
      // Call refresh endpoint directly (not through apiClient to avoid intercept loop)
      const res = await axios.post<RefreshResult>(
        `${import.meta.env.VITE_API_URL as string}/auth/refresh`,
        { refresh_token: refreshToken },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      )

      const newToken = res.data.access_token

      // The server ROTATES the refresh token: it deletes the one we just sent
      // and returns a new one. Failing to persist it here meant the next
      // refresh replayed a token the server had already revoked, so every
      // session died on its second refresh and dumped the user at /login.
      setRefreshToken(res.data.refresh_token)

      if (res.data.user) {
        useAuthStore.getState().setAuth(newToken, res.data.user)
      } else {
        useAuthStore.getState().setAccessToken(newToken)
      }

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
      clearRefreshToken()
      redirectToLogin()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default apiClient