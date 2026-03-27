import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import App from './App'
import ErrorBoundary from '@/components/ErrorBoundary'
import { EventPulseProvider } from 'eventpulse-analytics'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary level="app">
      <EventPulseProvider
        apiKey={import.meta.env.VITE_EVENTPULSE_API_KEY}
        endpoint={import.meta.env.VITE_EVENTPULSE_ENDPOINT}
      >
        <App />
      </EventPulseProvider>
    </ErrorBoundary>
  </StrictMode>
)