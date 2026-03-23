import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import '@/styles/globals.css'
import App from './App'
import ErrorBoundary from '@/components/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <GoogleOAuthProvider clientId="57561569997-tnkvn4vabsvrjul271l15r2is6dhp6m9.apps.googleusercontent.com">
      <ErrorBoundary level="app">
        <App />
      </ErrorBoundary>
    </GoogleOAuthProvider>
  </StrictMode>
)