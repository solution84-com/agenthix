/**
 * Recovery without email (getting-in spec, Getting back in). hq keeps no
 * email address, so a reset goes through someone who can vouch for the person:
 * an admin makes a one-time link in Organisation › People, or someone who can
 * run commands on hq's machine makes one there. The link lasts an hour, works
 * once, and only its hash is stored; making a new one ends the last. Setting
 * the password ends every sign-in the person had.
 */
import { HttpError, prisma } from 'wasp/server'
import { hashPassword } from 'wasp/auth/password'
import { generateInviteToken, hashInviteToken } from './inviteToken'
import { passwordProblem } from './passwordRules'
import { passwordResetLink, addressWorksOnlyHere } from './hqLinks'
import { personById } from '../server/identity/people'
import { readPublicOrgIdentity, type PublicOrgIdentity } from '../org/publicIdentity'
import { requireRole } from '../server/identity/requireRole'

export const RESET_TTL_MS = 60 * 60 * 1000

export type MadeReset = { link: string; expiresAt: Date; addressWorksOnlyHere: boolean }

/** A fresh link for `userId`, made by `madeById` — null when made on hq's machine. */
export async function makePasswordReset(userId: string, madeById: string | null, now = new Date()): Promise<MadeReset> {
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { deactivatedAt: true, erasedAt: true, auth: { select: { identities: { where: { providerName: 'username' } } } } },
  })
  if (!person || person.erasedAt) throw new HttpError(404, 'Person not found')
  if (person.deactivatedAt) throw new HttpError(400, 'They have left the organisation: reactivate them first')
  if (!person.auth?.identities.length) throw new HttpError(400, 'This account has no password to reset')

  const token = generateInviteToken()
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS)
  await prisma.$transaction([
    prisma.passwordReset.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
    prisma.passwordReset.create({ data: { tokenHash: hashInviteToken(token), userId, createdById: madeById, expiresAt } }),
  ])
  return { link: passwordResetLink(token), expiresAt, addressWorksOnlyHere: addressWorksOnlyHere() }
}

/** Organisation › People › the person › Reset password. Never one's own: that is Settings › Sign-in. */
export const createPasswordResetLink = async (
  args: { userId: string },
  context: { user?: { id: string } | null },
): Promise<MadeReset> => {
  await requireRole(context, 'ADMIN', 'Making a password reset link')
  if (typeof args?.userId !== 'string' || !args.userId) throw new HttpError(400, 'Who the link is for is required')
  if (args.userId === context.user!.id) throw new HttpError(400, 'Change your own password in Settings › Sign-in')
  return makePasswordReset(args.userId, context.user!.id)
}

export type ResetRefusal = { status: number; reason: 'unknown' | 'expired' | 'used' | 'password'; error: string }

export type ResetView = {
  person: { name: string; handle: string | null }
  /** Who made the link; null when it was made on hq's machine. */
  madeBy: { name: string } | null
  expiresAt: string
  org: PublicOrgIdentity
}

const UNKNOWN: ResetRefusal = { status: 404, reason: 'unknown', error: "This reset link doesn't work." }

async function usableReset(token: string, now: Date) {
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  if (!row) return { refusal: UNKNOWN }
  if (row.usedAt) return { refusal: { status: 410, reason: 'used', error: 'This reset link has already been used.' } as ResetRefusal }
  if (row.expiresAt <= now) return { refusal: { status: 410, reason: 'expired', error: 'This reset link has expired. Ask for a new one.' } as ResetRefusal }
  const person = await personById(row.userId)
  if (person.state !== 'active') return { refusal: UNKNOWN }
  return { row, person }
}

export async function readPasswordReset(token: string, now = new Date()): Promise<ResetView | ResetRefusal> {
  const found = await usableReset(token, now)
  if ('refusal' in found) return found.refusal!
  const { row, person } = found
  const madeBy = row.createdById ? await personById(row.createdById) : null
  return {
    person: { name: person.name, handle: person.handle },
    madeBy: madeBy ? { name: madeBy.name } : null,
    expiresAt: row.expiresAt.toISOString(),
    org: await readPublicOrgIdentity(),
  }
}

/**
 * Sets the password, spends the link and ends every session and unspent phone
 * pairing code the person had, in one transaction. Returns their username, so
 * the page can sign them in with the password just chosen.
 */
export async function completePasswordReset(
  token: string,
  password: string,
  now = new Date(),
): Promise<{ username: string } | ResetRefusal> {
  const problem = passwordProblem(password)
  if (problem) return { status: 400, reason: 'password', error: problem }
  const found = await usableReset(token, now)
  if ('refusal' in found) return found.refusal!
  const { row } = found

  const auth = await prisma.auth.findUnique({
    where: { userId: row.userId },
    select: { id: true, identities: { where: { providerName: 'username' } } },
  })
  const identity = auth?.identities[0]
  if (!auth || !identity) return UNKNOWN
  const providerData = JSON.parse(identity.providerData) as Record<string, unknown>
  const hashedPassword = await hashPassword(password)

  const spent = await prisma.$transaction(async (tx) => {
    // Only one request can spend the link: the conditional update is the claim.
    const { count } = await tx.passwordReset.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (count !== 1) return false
    await tx.authIdentity.update({
      where: { providerName_providerUserId: { providerName: identity.providerName, providerUserId: identity.providerUserId } },
      data: { providerData: JSON.stringify({ ...providerData, hashedPassword }) },
    })
    await tx.session.deleteMany({ where: { userId: auth.id } })
    await tx.mobileAuthToken.deleteMany({ where: { userId: row.userId } })
    return true
  })
  if (!spent) return { status: 410, reason: 'used', error: 'This reset link has already been used.' }
  return { username: identity.providerUserId }
}
