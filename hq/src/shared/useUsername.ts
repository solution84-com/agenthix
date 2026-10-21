import { useAuth } from 'wasp/client/auth'

/** The signed-in person's username, or null while it loads. */
export function useUsername(): string | null {
  const { data: user } = useAuth()
  // The auth identity type does not expose the username identity's shape.
  return (user as { identities?: { username?: { id?: string } | null } } | null | undefined)?.identities?.username?.id ?? null
}
