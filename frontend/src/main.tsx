import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import App from './App'
import ErrorBoundary from '@/components/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary level="app">
      <App />
    </ErrorBoundary>
  </StrictMode>
)