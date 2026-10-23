/**
 * The first admin gets in by a one-time link hq makes while it has no users
 * (getting-in spec, The first admin). The key is an `Invite` of kind
 * FIRST_ADMIN: only its hash is stored, it lasts 24 hours, and making a new one
 * withdraws the last, so only the newest link works. hq makes one at every start
 * with no users and prints it from hq's own address; `agenthix hq invite-admin` on
 * hq's machine makes one without a restart.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from 'wasp/server'
import type { Invite, Prisma } from '@prisma/client'
import { generateInviteToken, hashInviteToken } from './inviteToken'
import { invitationLink } from './hqLinks'
import { BRANDING } from '@agenthix/core'

export const FIRST_ADMIN_TTL_MS = 24 * 60 * 60 * 1000

/** Serialises making the first admin's account and making a new first-admin key. */
export async function lockFirstAdmin(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('first-admin-signup', 0))`
}

export type IssuedLink = { link: string; expiresAt: Date }

/**
 * A fresh first-admin link, withdrawing any earlier one; null once hq has a user. `linkRef` is the name Agenthix Cloud
 * gave the link when it asked for it (cloudAccountLinks.ts), kept with the account it makes.
 */
export async function issueFirstAdminLink(now = new Date(), linkRef: string | null = null): Promise<IssuedLink | null> {
  const token = generateInviteToken()
  const expiresAt = new Date(now.getTime() + FIRST_ADMIN_TTL_MS)
  const issued = await prisma.$transaction(async (tx) => {
    await lockFirstAdmin(tx)
    if ((await tx.user.count()) > 0) return false
    await tx.invite.updateMany({
      where: { kind: 'FIRST_ADMIN', consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    })
    await tx.invite.create({
      data: { kind: 'FIRST_ADMIN', tokenHash: hashInviteToken(token), role: 'ADMIN', createdBy: null, expiresAt, linkRef },
    })
    return true
  })
  return issued ? { link: invitationLink(token), expiresAt } : null
}

export function firstAdminLogLine(link: string): string {
  return `No admin yet. Open this link to set up ${BRANDING.displayName} (valid 24 hours): ${link}`
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/**
 * The open first-admin key `presented` matches, or null. There is at most one
 * open key, and it is compared in constant time against the stored hash rather
 * than looked up by it.
 */
export async function openFirstAdminKey(presented: string, now = new Date()): Promise<Invite | null> {
  const open = await prisma.invite.findMany({
    where: { kind: 'FIRST_ADMIN', consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
  })
  const presentedHash = sha256(presented)
  let match: Invite | null = null
  for (const row of open) {
    const stored = Buffer.from(row.tokenHash, 'hex')
    if (stored.length === presentedHash.length && timingSafeEqual(stored, presentedHash)) match = row
  }
  return match
}
