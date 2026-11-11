import { configureQueryClient } from 'wasp/client/operations'
import { backgroundRetry, backgroundRetryDelay } from '@agenthix/ui/attention'
import { initTheme } from './shared/theme'

// React Query pauses fetches when navigator.onLine is false.
// Chrome can incorrectly report offline for localhost origins due to WebSocket
// timing. Setting networkMode: 'always' ensures queries always fire regardless
// of online status — requests fail naturally if the server is unreachable.
// Every read retries quietly by the one policy (ui/DESIGN-SYSTEM.md, *Messages*); a query with a rule of its own keeps it.
export function setupClient(): void {
  initTheme()
  configureQueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: backgroundRetry,
        retryDelay: attempt => backgroundRetryDelay(attempt),
      },
      mutations: {
        networkMode: 'always',
      },
    },
  })
}
