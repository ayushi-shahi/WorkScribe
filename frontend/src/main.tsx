import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import App from './App'
import ErrorBoundary from '@/components/ErrorBoundary'
import { initAnalytics } from '@/lib/analytics'

// Started once, outside React. The package's own provider stores its client in
// a ref assigned during an effect, so consumers only ever saw `null` and manual
// tracking silently did nothing — see lib/analytics.ts.
initAnalytics()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary level="app">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
