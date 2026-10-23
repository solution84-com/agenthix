import { useQuery, getUserSettings } from 'wasp/client/operations'

export type OrgAdminState = 'loading' | 'admin' | 'refused'

/** Unlike `useIsAdmin`, nothing is shown to anyone until the role is known to be ADMIN. */
export function useOrgAdminState(): OrgAdminState {
  const { data, isLoading } = useQuery(getUserSettings)
  if (isLoading || data === undefined) return 'loading'
  return data?.role === 'ADMIN' ? 'admin' : 'refused'
}
