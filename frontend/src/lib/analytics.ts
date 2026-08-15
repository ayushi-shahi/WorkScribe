import { EventPulseClient } from 'eventpulse-analytics'

/**
 * Product analytics.
 *
 * Talks to EventPulseClient directly rather than through the package's React
 * provider: in the published version the provider creates the client inside an
 * effect and stores it in a ref, which schedules no re-render, so every
 * consumer of useEventPulse() receives `client: null` and silently tracks
 * nothing. Owning a single module-level client avoids that entirely and gives
 * one place to guarantee analytics can never break the app.
 *
 * Every call is wrapped: a tracking failure must never surface to a user or
 * interrupt a mutation.
 */

let client: EventPulseClient | null = null

/** Event names, kept in one place so dashboards aren't chasing typos. */
export const Ev = {
  signup: 'signup_completed',
  login: 'login',
  orgCreated: 'org_created',
  projectCreated: 'project_created',
  taskCreated: 'task_created',
  taskStatusChanged: 'task_status_changed',
  taskCompleted: 'task_completed',
  commentAdded: 'comment_added',
  sprintStarted: 'sprint_started',
  sprintCompleted: 'sprint_completed',
  wikiPageCreated: 'wiki_page_created',
  wikiPageSaved: 'wiki_page_saved',
  memberInvited: 'member_invited',
  searchPerformed: 'search_performed',
} as const

export function initAnalytics(): void {
  const apiKey = import.meta.env.VITE_EVENTPULSE_API_KEY as string | undefined
  const endpoint = import.meta.env.VITE_EVENTPULSE_ENDPOINT as string | undefined

  // Absent config is a normal state (local dev, forks, preview builds) — stay
  // quiet and make every track() a no-op rather than logging on every call.
  if (!apiKey || !endpoint) return

  try {
    client = new EventPulseClient({
      apiKey,
      endpoint,
      autoTrack: true, // page views + clicks
      batchInterval: 5000,
    })
  } catch {
    client = null
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  try {
    client?.track(event, properties)
  } catch {
    /* analytics must never break a user flow */
  }
}

export function identify(userId: string): void {
  try {
    if (userId) client?.identify(userId)
  } catch {
    /* ignore */
  }
}

export function isAnalyticsEnabled(): boolean {
  return client !== null
}
