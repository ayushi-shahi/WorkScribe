/**
 * Refresh-token storage.
 *
 * Centralised because the token was previously read and written from five
 * different places with slightly different behaviour, which is how the
 * rotated token ended up being dropped on refresh.
 */

const REFRESH_TOKEN_KEY = 'refresh_token'

export function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    // sessionStorage can throw in private-mode / blocked-cookie contexts
    return null
  }
}

export function setRefreshToken(token: string | null | undefined): void {
  try {
    if (token) sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
  } catch {
    // ignore — the user simply won't survive a reload
  }
}

export function clearRefreshToken(): void {
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // ignore
  }
}
