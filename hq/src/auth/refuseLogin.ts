import { HttpError } from 'wasp/server'
import type { OnBeforeLoginHook } from 'wasp/server/auth'

/**
 * Someone who has left the organisation cannot sign in (adr-0100): Remove ends
 * their sessions, and this refuses every new one until they are reactivated.
 * An erased person has no sign-in identity left to try.
 */
export const refuseLogin: OnBeforeLoginHook = async ({ user }) => {
  if (user.deactivatedAt) throw new HttpError(403, 'This account has been removed from the organisation.')
}
