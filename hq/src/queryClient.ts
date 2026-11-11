import { configureQueryClient } from 'wasp/client/operations'
import { backgroundRetryDelay } from '@agenthix/ui/attention'
import { siteReadRetry } from './shared/siteRead'
import { initTheme } from './shared/theme'

/** Wasp's query of the signed-in person (`useAuth`), as its key is registered. */
const SIGNED_IN = 'auth/me'

type KeyedQuery = { queryKey: readonly unknown[] }

/**
 * Whether a query may read again on its own (on a page opening, the window's focus, a reconnect). The signed-in
 * person is read once and again only when signing in or out: Wasp's page wrapper replaces the whole app with an error
 * box when that read fails, even with the person already known, so a read made on its own while HQ is away would stop
 * the person on a navigation (ui/DESIGN-SYSTEM.md, *Messages*: a read never opens what stops the person).
 */
export const readsOnItsOwn = (query: KeyedQuery): boolean => query.queryKey[0] !== SIGNED_IN

// React Query pauses fetches when navigator.onLine is false.
// Chrome can incorrectly report offline for localhost origins due to WebSocket
// timing. Setting networkMode: 'always' ensures queries always fire regardless
// of online status — requests fail naturally if the server is unreachable.
// Every read retries quietly by the one policy (ui/DESIGN-SYSTEM.md, *Messages*), except a site that did not answer:
// HQ already waited for it, so it is said at once. A query with a rule of its own keeps it.
export function setupClient(): void {
  initTheme()
  configureQueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: siteReadRetry,
        retryDelay: attempt => backgroundRetryDelay(attempt),
        refetchOnMount: readsOnItsOwn,
        refetchOnWindowFocus: readsOnItsOwn,
        refetchOnReconnect: readsOnItsOwn,
      },
      mutations: {
        networkMode: 'always',
      },
    },
  })
}
