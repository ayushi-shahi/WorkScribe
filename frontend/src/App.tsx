import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

// Layouts — kept eager, always needed on first render
import OrgLayout from '@/layouts/OrgLayout'
import WikiLayout from '@/layouts/WikiLayout'
import ProtectedRoute from '@/components/ProtectedRoute'

// Pages — lazy loaded so each route gets its own chunk
const LoginPage           = lazy(() => import('@/pages/LoginPage'))
const RegisterPage        = lazy(() => import('@/pages/RegisterPage'))
const ForgotPasswordPage  = lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage   = lazy(() => import('@/pages/ResetPasswordPage'))
const AcceptInvitePage    = lazy(() => import('@/pages/AcceptInvitePage'))
const OrgCreatePage       = lazy(() => import('@/pages/OrgCreatePage'))
const DashboardPage       = lazy(() => import('@/pages/DashboardPage'))
const BoardPage           = lazy(() => import('@/pages/BoardPage'))
const BacklogPage         = lazy(() => import('@/pages/BacklogPage'))
const MyWorkPage          = lazy(() => import('@/pages/MyWorkPage'))
const WikiHomePage        = lazy(() => import('@/pages/WikiHomePage'))
const PageEditorPage      = lazy(() => import('@/pages/PageEditorPage'))
const OrgSettingsPage     = lazy(() => import('@/pages/OrgSettingsPage'))
const MembersPage         = lazy(() => import('@/pages/MembersPage'))
const NotFoundPage        = lazy(() => import('@/pages/NotFoundPage'))
const ProjectSettingsPage = lazy(() => import('@/pages/ProjectSettingsPage'))

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
      <RouterProvider router={router} />
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