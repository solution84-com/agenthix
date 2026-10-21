/**
 * The session's CSRF token. The server returns it once, at sign-in (console/src/auth/sessions.ts says why), and the
 * screens send it with every request. It is kept in sessionStorage: scoped to this origin and port, so a reload keeps
 * the session, while a cookie, which another server on 127.0.0.1 also receives, is never enough to open one. Never
 * localStorage (it would outlive the tab) and never a cookie. A new tab is handed it by an open one (tokenShare.ts).
 */
const KEY = 'csrfToken'

// Where storage is blocked, the token lasts until the page reloads.
let inMemory: string | null = null

export function csrfToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? inMemory
  } catch {
    return inMemory
  }
}

export function keepCsrfToken(token: string): void {
  inMemory = token
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // Kept in memory above.
  }
}

export function forgetCsrfToken(): void {
  inMemory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was stored.
  }
}
