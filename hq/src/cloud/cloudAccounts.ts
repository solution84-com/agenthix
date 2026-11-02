/**
 * Where signing in with an Agenthix account meets hq's data (pre-release spec C2, C3): the links between people and
 * their Agenthix accounts, the password check before linking, hq's own session after signing in, and telling the
 * people who sign in with Cloud when the connection ends.
 */
import { prisma } from 'wasp/server'
import { verifyPassword } from 'wasp/auth/password'
import { consumeRateLimit, giveBackRateLimit } from '../server/rateLimit'
import { notificationsChanged } from '../server/personEvents'
import { affectedMembers } from '../sites/scheduled/scheduledChanges'
import type { CloudLinkStore } from './cloudSignIn'

const ACTIVE = { deactivatedAt: null, erasedAt: null } as const

export const cloudLinkStore: CloudLinkStore = {
  async personWith(issuer, subject) {
    const row = await prisma.cloudAccountLink.findUnique({
      where: { issuer_subject: { issuer, subject } },
      select: { userId: true, user: { select: { deactivatedAt: true, erasedAt: true } } },
    })
    return row ? { userId: row.userId, active: !row.user.deactivatedAt && !row.user.erasedAt } : null
  },
  async link(userId, issuer, subject) {
    const holder = await prisma.cloudAccountLink.findUnique({ where: { issuer_subject: { issuer, subject } }, select: { userId: true } })
    if (holder && holder.userId !== userId) return 'taken'
    try {
      await prisma.cloudAccountLink.upsert({
        where: { userId },
        create: { userId, issuer, subject },
        update: { issuer, subject, linkedAt: new Date() },
      })
    } catch (err) {
      // Someone else linked the same account in between: the unique (issuer, subject) refused it.
      if ((err as { code?: string }).code === 'P2002') return 'taken'
      throw err
    }
    return 'linked'
  },
}

export async function readOwnCloudLink(userId: string): Promise<{ linkedAt: string } | null> {
  const row = await prisma.cloudAccountLink.findUnique({ where: { userId }, select: { linkedAt: true } })
  return row ? { linkedAt: row.linkedAt.toISOString() } : null
}

export async function unlinkCloudAccount(userId: string): Promise<boolean> {
  const { count } = await prisma.cloudAccountLink.deleteMany({ where: { userId } })
  return count > 0
}

/** Wrong passwords allowed per person in a window when linking, as changing a password allows. */
const WRONG_PASSWORD_RULE = { max: 5, windowMs: 15 * 60 * 1000 }

export async function passwordIsRight(userId: string, password: string): Promise<boolean> {
  const key = `cloud-link:${userId}`
  // Counted before the check, so guesses sent at once can't all be checked before any is counted.
  if (!(await consumeRateLimit(key, WRONG_PASSWORD_RULE))) return false
  const identity = await prisma.authIdentity.findFirst({ where: { providerName: 'username', auth: { userId } }, select: { providerData: true } })
  const hashed = identity ? (JSON.parse(identity.providerData) as { hashedPassword?: unknown }).hashedPassword : undefined
  const right = typeof hashed === 'string' && await verifyPassword(hashed, password).then(() => true, () => false)
  if (right) await giveBackRateLimit(key)
  return right
}

/** hq's own session for the person, made as Wasp's password sign-in makes one: its id, for the browser to keep. */
export async function makeBrowserSession(userId: string): Promise<string> {
  const auth = await prisma.auth.findUniqueOrThrow({ where: { userId }, select: { id: true } })
  // Imported when used: wasp/auth/session reaches the server's set-up, which tests of this module do not load.
  const { createSession } = await import('wasp/auth/session')
  return (await createSession(auth.id)).id
}

/** The Agenthix accounts of the active members a change affects, for the downtime email. */
export async function linkedAccountsAffected(siteId: string | null): Promise<string[]> {
  const members = [...(await affectedMembers(siteId)).keys()]
  if (members.length === 0) return []
  const rows = await prisma.cloudAccountLink.findMany({ where: { userId: { in: members }, user: ACTIVE }, select: { subject: true } })
  return rows.map(r => r.subject)
}

export const CLOUD_SIGN_IN_ENDED_NOTIFICATION = 'cloud_sign_in_ended'

/**
 * As the connection ends: everyone still here with a linked account is told that Sign in with Agenthix Cloud stops
 * and that they sign in with their password. Every account in hq has a password (accounts are made only with one);
 * for a person who has forgotten it, an admin makes a reset link, hq's own way back in.
 */
export async function tellLinkedPeopleSignInEnds(): Promise<void> {
  const people = (await prisma.cloudAccountLink.findMany({ where: { user: ACTIVE }, select: { userId: true } })).map(r => r.userId)
  if (people.length === 0) return
  await prisma.notification.createMany({
    data: people.map(userId => ({
      userId,
      type: CLOUD_SIGN_IN_ENDED_NOTIFICATION,
      title: 'Sign in with your HQ password from now on',
      body: 'HQ is no longer connected to Agenthix Cloud, so Sign in with Agenthix Cloud stops working. You stay signed in here. Next time, sign in with your username and password. If you don\'t know your password, ask an admin for a reset link.',
    })),
  })
  notificationsChanged(people)
}
