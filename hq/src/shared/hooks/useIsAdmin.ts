import { useQuery, getUserSettings } from 'wasp/client/operations'

export const ONLY_ADMIN_SHAPES_AGENTS =
  'Only an organisation admin can change, stop, delete or export an agent. Ask an admin for the ADMIN role.'
export const ONLY_ADMIN_SHAPES_TEMPLATES =
  'Only an organisation admin can create, change or delete board templates. Ask an admin for the ADMIN role.'

/**
 * Whether the signed-in person is an organisation admin. The server refuses
 * every admin-only write regardless, so this only keeps the controls from
 * offering what would be refused. Until the role has loaded the controls stay
 * enabled rather than flashing disabled.
 */
export function useIsAdmin(): boolean {
  const { data: settings } = useQuery(getUserSettings)
  return settings == null || settings.role === 'ADMIN'
}
