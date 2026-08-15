import { Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

// Layouts — kept eager, always needed on first render
import OrgLayout from '@/layouts/OrgLayout'
import WikiLayout from '@/layouts/WikiLayout'
import ProtectedRoute from '@/components/ProtectedRoute'
import AuthBootstrap from '@/components/AuthBootstrap'
import { lazyWithRetry } from '@/lib/lazyWithRetry'

// Pages — lazy loaded so each route gets its own chunk
const LoginPage           = lazyWithRetry(() => import('@/pages/LoginPage'), 'LoginPage')
const RegisterPage        = lazyWithRetry(() => import('@/pages/RegisterPage'), 'RegisterPage')
const ForgotPasswordPage  = lazyWithRetry(() => import('@/pages/ForgotPasswordPage'), 'ForgotPasswordPage')
const ResetPasswordPage   = lazyWithRetry(() => import('@/pages/ResetPasswordPage'), 'ResetPasswordPage')
const AcceptInvitePage    = lazyWithRetry(() => import('@/pages/AcceptInvitePage'), 'AcceptInvitePage')
const OrgCreatePage       = lazyWithRetry(() => import('@/pages/OrgCreatePage'), 'OrgCreatePage')
const DashboardPage       = lazyWithRetry(() => import('@/pages/DashboardPage'), 'DashboardPage')
const BoardPage           = lazyWithRetry(() => import('@/pages/BoardPage'), 'BoardPage')
const BacklogPage         = lazyWithRetry(() => import('@/pages/BacklogPage'), 'BacklogPage')
const MyWorkPage          = lazyWithRetry(() => import('@/pages/MyWorkPage'), 'MyWorkPage')
const WikiHomePage        = lazyWithRetry(() => import('@/pages/WikiHomePage'), 'WikiHomePage')
const PageEditorPage      = lazyWithRetry(() => import('@/pages/PageEditorPage'), 'PageEditorPage')
const OrgSettingsPage     = lazyWithRetry(() => import('@/pages/OrgSettingsPage'), 'OrgSettingsPage')
const MembersPage         = lazyWithRetry(() => import('@/pages/MembersPage'), 'MembersPage')
const NotFoundPage        = lazyWithRetry(() => import('@/pages/NotFoundPage'), 'NotFoundPage')
const ProjectSettingsPage = lazyWithRetry(() => import('@/pages/ProjectSettingsPage'), 'ProjectSettingsPage')

// ── TanStack Query client ──────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// ── Minimal fallback — just keeps layout stable while chunk loads ──────────────
function PageFallback() {
  return null
}

// ── Router ─────────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // Public routes
  { path: '/login',                    element: <Suspense fallback={<PageFallback />}><LoginPage /></Suspense> },
  { path: '/register',                 element: <Suspense fallback={<PageFallback />}><RegisterPage /></Suspense> },
  { path: '/forgot-password',          element: <Suspense fallback={<PageFallback />}><ForgotPasswordPage /></Suspense> },
  { path: '/reset-password',           element: <Suspense fallback={<PageFallback />}><ResetPasswordPage /></Suspense> },
  { path: '/invitations/:token',       element: <Suspense fallback={<PageFallback />}><AcceptInvitePage /></Suspense> },
  { path: '/invitations/:token/accept',element: <Suspense fallback={<PageFallback />}><AcceptInvitePage /></Suspense> },
  { path: '/create-org',               element: <Suspense fallback={<PageFallback />}><OrgCreatePage /></Suspense> },

  // Protected org routes
  {
    path: '/org/:slug',
    element: (
      <ProtectedRoute>
        <OrgLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard',               element: <Suspense fallback={<PageFallback />}><DashboardPage /></Suspense> },
      { path: 'my-work',                 element: <Suspense fallback={<PageFallback />}><MyWorkPage /></Suspense> },
      { path: 'projects/:key/board',     element: <Suspense fallback={<PageFallback />}><BoardPage /></Suspense> },
      { path: 'projects/:key/backlog',   element: <Suspense fallback={<PageFallback />}><BacklogPage /></Suspense> },
      { path: 'projects/:key/settings',  element: <Suspense fallback={<PageFallback />}><ProjectSettingsPage /></Suspense> },

      // ── Wiki routes ────────────────────────────────────────────────────────
      {
        path: 'wiki',
        element: <WikiLayout />,
        children: [
          { index: true,           element: <Suspense fallback={<PageFallback />}><WikiHomePage /></Suspense> },
          { path: ':spaceId',      element: <Suspense fallback={<PageFallback />}><WikiHomePage /></Suspense> },
          { path: ':spaceId/:pageId', element: <Suspense fallback={<PageFallback />}><PageEditorPage /></Suspense> },
        ],
      },

      { path: 'settings',         element: <Suspense fallback={<PageFallback />}><OrgSettingsPage /></Suspense> },
      { path: 'settings/members', element: <Suspense fallback={<PageFallback />}><MembersPage /></Suspense> },
    ],
  },

  // Root redirect
  { path: '/', element: <Navigate to="/login" replace /> },

  // 404
  { path: '*', element: <Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense> },
])

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface3)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font)',
            fontSize: 13,
          },
          success: {
            iconTheme: { primary: 'var(--green)', secondary: 'var(--surface3)' },
          },
          error: {
            iconTheme: { primary: 'var(--red)', secondary: 'var(--surface3)' },
          },
        }}
      />
    </QueryClientProvider>
  )
}