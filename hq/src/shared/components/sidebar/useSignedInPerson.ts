import { useAuth } from 'wasp/client/auth'
import { useQuery, getUserSettings } from 'wasp/client/operations'

/** Who is signed in: their username, and whether they are an organisation admin (Manage is theirs alone). */
export function useSignedInPerson(): { username: string; isAdmin: boolean } {
  const { data: user } = useAuth()
  const { data: settings } = useQuery(getUserSettings)
  // The auth identity type does not expose the username identity's shape.
  const username: string = (user as any)?.identities?.username?.id ?? 'admin'
  return { username, isAdmin: (settings as { role?: string } | undefined)?.role === 'ADMIN' }
}
