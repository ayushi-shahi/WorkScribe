import { lazy, type ComponentType } from 'react'

/**
 * lazy() that survives a deployment happening mid-session.
 *
 * Route chunks are content-hashed, so every deploy produces new filenames. A
 * tab that loaded index.html before the deploy still asks for the OLD chunk
 * name, which no longer exists. The dynamic import then rejects and React
 * renders the error boundary — the user sees a permanently broken page until
 * they think to hard-refresh.
 *
 * On failure we reload once so the browser fetches the current index.html and
 * its matching chunks. The sessionStorage flag makes it strictly one attempt,
 * so a genuinely broken chunk surfaces as a real error instead of a reload
 * loop.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  name: string,
) {
  const key = `chunk-reload:${name}`

  return lazy(async () => {
    try {
      const mod = await factory()
      sessionStorage.removeItem(key)
      return mod
    } catch (error) {
      if (sessionStorage.getItem(key) === '1') {
        // Already retried — this is a real failure, let it surface.
        throw error
      }
      sessionStorage.setItem(key, '1')
      window.location.reload()

      // Keep the promise pending so React does not render an error while the
      // reload is in flight.
      return await new Promise<{ default: T }>(() => {})
    }
  })
}
