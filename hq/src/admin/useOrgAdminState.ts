import { useQuery, getUserSettings } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'

export type OrgAdminState = 'loading' | 'admin' | 'refused'

/** Unlike `useIsAdmin`, nothing is shown to anyone until the role is known to be ADMIN. */
export function useOrgAdminState(): OrgAdminState {
  return useOrgAdminRead().state
}

/**
 * The same, with the nudge for when the role could not be read at all: in place of the page, so the gate does not
 * wait for ever, and never as "Admins only", which would be untrue.
 */
export function useOrgAdminRead(): { state: OrgAdminState; unreadable: React.ReactNode } {
  const query = useQuery(getUserSettings)
  const read = useBackgroundRead(query, { what: 'Your role' })
  const { data, isLoading } = query
  const state = isLoading || data === undefined ? 'loading' : data?.role === 'ADMIN' ? 'admin' : 'refused'
  return { state, unreadable: state === 'loading' && read.failedWithoutData ? read.nudge : null }
}
