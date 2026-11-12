/**
 * *Enter the demo* (live demo spec, *Getting in*): one press makes a visitor's account and signs it in. The account is
 * made as accepting an invitation makes one (`auth/inviteAccept.ts`) — a user, a username identity with a long random
 * password nobody is shown, and the member role — but its username marks it as a visitor (`visitors.ts`), and it
 * never holds an admin or the fleet admin role. It is a viewer of the sample's projects and gets the sample's pins
 * (`sampleShare.ts`), its own space with two tasks for them there (`visitorTasks.ts`), and is signed in with hq's own
 * session, as Cloud sign-in does.
 *
 * Two caps: `ENTRIES_PER_ADDRESS` accounts an hour per address (an IPv6 address's /64, `address.ts`), and
 * `MAX_VISITORS` visitors active in the last hour (`../activeVisitors.ts`): a visitor idle for an hour frees their seat.
 */
import { randomBytes } from 'node:crypto'
import { prisma } from 'wasp/server'
import { hashPassword } from 'wasp/auth/password'
import type { Prisma } from '@prisma/client'
import { consumeRateLimit } from '../../server/rateLimit'
import { ensurePersonalProjectAfterSignup } from '../../projects/personalProject'
import { applyDefaultPictures } from '../../pictures/service'
import { makeBrowserSession } from '../../cloud/cloudAccounts'
import { VISITOR_USERNAME_PREFIX, visitorNumber } from '../visitors'
import { activeVisitors, markSeen } from '../activeVisitors'
import { entryAddress } from './address'
import { shareTheSample } from './sampleShare'
import { giveVisitorTasks } from './visitorTasks'

export const ENTRIES_PER_ADDRESS = 5
export const ENTRY_WINDOW_MS = 60 * 60 * 1000
export const MAX_VISITORS = 300

export const DEMO_FULL = 'The demo is full right now. Come back in a little while.'

/** Finding 9: the per-address cap says what it is, not that the demo is full. */
export function tooManyFromAddress(minutes: number): string {
  return `Too many visitors from your network this hour. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}

export const entryLimitKey = (ip: string) => `demo-enter:${entryAddress(ip)}`

export type Entered =
  | { ok: true; sessionId: string }
  | { ok: false; status: 429 | 503; error: string; reason: 'full' | 'address' }

/** Whole minutes, at least one, until the address's hour ends and it may enter again. */
async function minutesLeft(key: string, now = Date.now()): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { ip: key }, select: { resetAt: true } })
  const ms = row ? row.resetAt.getTime() - now : ENTRY_WINDOW_MS
  return Math.max(1, Math.ceil(ms / 60_000))
}

/** Serialises counting the visitors and making one, so two presses at once cannot both pass the last place. */
async function lockVisitors(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('demo-visitor-entry', 0))`
}

export async function enterDemo(ip: string): Promise<Entered> {
  const key = entryLimitKey(ip)
  if (!(await consumeRateLimit(key, { max: ENTRIES_PER_ADDRESS, windowMs: ENTRY_WINDOW_MS }))) {
    return { ok: false, status: 429, error: tooManyFromAddress(await minutesLeft(key)), reason: 'address' }
  }
  const username = `${VISITOR_USERNAME_PREFIX}${randomBytes(12).toString('hex')}`
  const providerData = JSON.stringify({ hashedPassword: await hashPassword(randomBytes(32).toString('base64url')) })
  const made = await prisma.$transaction(async (tx) => {
    await lockVisitors(tx)
    if ((await activeVisitors(tx)) >= MAX_VISITORS) return null
    const user = await tx.user.create({
      data: {
        displayName: `Visitor ${visitorNumber(username)}`,
        fleetAdmin: false,
        auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData } } } },
      },
      select: { id: true },
    })
    await tx.userSettings.create({ data: { userId: user.id, role: 'MEMBER', config: {} } })
    await shareTheSample(tx, user.id)
    await markSeen(user.id, tx)
    return user
  })
  if (!made) return { ok: false, status: 503, error: DEMO_FULL, reason: 'full' }
  await ensurePersonalProjectAfterSignup(made.id)
  await applyDefaultPictures({ kind: 'person', id: made.id })
  await giveVisitorTasks(made.id)
  return { ok: true, sessionId: await makeBrowserSession(made.id) }
}
