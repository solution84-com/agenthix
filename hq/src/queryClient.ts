import { configureQueryClient } from 'wasp/client/operations'
import { initTheme } from './shared/theme'

// React Query pauses fetches when navigator.onLine is false.
// Chrome can incorrectly report offline for localhost origins due to WebSocket
// timing. Setting networkMode: 'always' ensures queries always fire regardless
// of online status — requests fail naturally if the server is unreachable.
export function setupClient(): void {
  initTheme()
  configureQueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
      },
      mutations: {
        networkMode: 'always',
      },
    },
  })
}
