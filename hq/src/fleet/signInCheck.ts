/**
 * `signIn.check` (host-management spec §7): the Fleet Console has no accounts, so it asks hq whether a username and
 * password sign in, and lets in only an account that holds the fleet admin role. The password is checked as Wasp's
 * own login route checks it — the username identity, lower-cased as Wasp stores it, and Wasp's `verifyPassword`, as
 * auth/changePassword.ts does — and nothing is kept: no session is made, and the password goes no further.
 *
 * It is held to hq's sign-in limit (auth/signInLimit.ts): every check arrives from the one Fleet Console, which counts
 * as one address. Checks run one at a time, so a burst of guesses cannot all pass the limit before any is counted
 * (the login route still has that gap; it is not repeated here).
 */
import { prisma } from 'wasp/server'
import { verifyPassword } from 'wasp/auth/password'
import { consumeRateLimit, isRateLimited } from '../server/rateLimit'
import { SIGN_IN_LIMIT, TOO_MANY_SIGN_INS } from '../auth/signInLimit'
import { personById } from '../server/identity/people'
import { ConsoleRefusal } from './consoleMethods'

export const CONSOLE_SIGN_IN_KEY = 'sign-in:console-link'
const RULE = { max: SIGN_IN_LIMIT, windowMs: 15 * 60 * 1000 }

export type SignInCheck = { ok: true; user: { id: string; name: string; fleetAdmin: boolean } } | { ok: false }

let queue: Promise<unknown> = Promise.resolve()

export function checkSignIn(username: string, password: string): Promise<SignInCheck> {
  const run = queue.then(() => check(username, password))
  queue = run.catch(() => {})
  return run
}

async function check(username: string, password: string): Promise<SignInCheck> {
  if (await isRateLimited(CONSOLE_SIGN_IN_KEY, RULE)) throw new ConsoleRefusal('rate_limited', TOO_MANY_SIGN_INS)

  const identity = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username.toLowerCase() } },
    select: { authId: true, providerData: true },
  })
  let right = false
  if (identity) {
    try {
      const { hashedPassword } = JSON.parse(identity.providerData) as { hashedPassword?: unknown }
      if (typeof hashedPassword === 'string') {
        await verifyPassword(hashedPassword, password)
        right = true
      }
    } catch {
      right = false
    }
  }
  if (!identity || !right) {
    await consumeRateLimit(CONSOLE_SIGN_IN_KEY, RULE)
    return { ok: false }
  }

  const auth = await prisma.auth.findUnique({
    where: { id: identity.authId },
    select: { user: { select: { id: true, fleetAdmin: true, deactivatedAt: true, erasedAt: true } } },
  })
  const user = auth?.user
  // Someone who has left cannot sign in (auth/refuseLogin.ts); as on the login route, that is not a wrong password.
  if (!user || user.deactivatedAt || user.erasedAt) return { ok: false }
  return { ok: true, user: { id: user.id, name: (await personById(user.id)).name, fleetAdmin: user.fleetAdmin } }
}
