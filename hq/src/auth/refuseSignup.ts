import { HttpError } from 'wasp/server'
import type { OnBeforeSignupHook } from 'wasp/server/auth'

/**
 * Wasp mounts POST /auth/username/signup for its username provider, and it would
 * create an account for anyone who can reach hq. hq creates every account itself
 * (an accepted invite, the first-admin key, or an admin's create-user action, all
 * writing rows directly), so the framework's route is refused outright.
 */
export const refuseSignup: OnBeforeSignupHook = async () => {
  throw new HttpError(403, 'Sign-up is by invitation only. Ask an admin for an invite link.')
}
