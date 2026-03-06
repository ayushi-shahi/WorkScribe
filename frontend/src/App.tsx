import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

// Layouts
import OrgLayout from '@/layouts/OrgLayout'
import ProtectedRoute from '@/components/ProtectedRoute'

// Pages
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import AcceptInvitePage from '@/pages/AcceptInvitePage'
import OrgCreatePage from '@/pages/OrgCreatePage'
import DashboardPage from '@/pages/DashboardPage'
import BoardPage from '@/pages/BoardPage'
import BacklogPage from '@/pages/BacklogPage'
import WikiHomePage from '@/pages/WikiHomePage'
import PageEditorPage from '@/pages/PageEditorPage'
import OrgSettingsPage from '@/pages/OrgSettingsPage'
import MembersPage from '@/pages/MembersPage'
import NotFoundPage from '@/pages/NotFoundPage'

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

// ── Router ─────────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // Public routes
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/invitations/:token', element: <AcceptInvitePage /> },
  { path: '/create-org', element: <OrgCreatePage /> },

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
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects/:key/board', element: <BoardPage /> },
      { path: 'projects/:key/backlog', element: <BacklogPage /> },
      { path: 'wiki', element: <WikiHomePage /> },
      { path: 'wiki/:spaceKey/:pageId', element: <PageEditorPage /> },
      { path: 'settings', element: <OrgSettingsPage /> },
      { path: 'settings/members', element: <MembersPage /> },
    ],
  },

  // Root redirect
  { path: '/', element: <Navigate to="/login" replace /> },

  // 404
  { path: '*', element: <NotFoundPage /> },
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