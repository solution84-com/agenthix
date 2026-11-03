/**
 * Accepting an invitation, or the first-admin link (getting-in spec): the
 * person's name, username and password make their account. An invitation's
 * projects are joined as a Member and pinned for them, and they land in the
 * first one; the first admin lands in setup.
 *
 * The code is checked before the username, so a username is only ever confirmed
 * taken to someone holding a code that works.
 */
import { prisma } from 'wasp/server'
import { hashPassword } from 'wasp/auth/password'
import type { Invite, Prisma } from '@prisma/client'
import { ensurePersonalProjectAfterSignup } from '../projects/personalProject'
import { normaliseDisplayName } from '../server/identity/personSummary'
import { lockFirstAdmin } from './firstAdmin'
import { UNKNOWN_CODE, findInvite, inviteRefusal, type InviteRefusal, type Role } from './inviteService'

/** Where the first admin goes once their account exists: setup's next step. */
export const SETUP_PATH = '/setup'

export type AcceptInput = { token: string; name: string; username: string; password: string }

export type AcceptResult =
  | { success: true; landAt: string }
  | { error: string; status: number; reason?: InviteRefusal | 'taken' | 'name' }

const takenError = (username: string): AcceptResult =>
  ({ error: `Username '${username}' is already taken`, status: 400, reason: 'taken' })

/**
 * `fleetAdmin` is true only for the first account, made at install: it holds the organisation admin and fleet admin
 * roles (host-management spec §1, §6). An invitation never carries the fleet admin role, whoever made it.
 */
async function createUserWithRole(
  tx: Prisma.TransactionClient,
  account: { username: string; hashedPassword: string; displayName: string },
  role: Role,
  fleetAdmin = false,
): Promise<{ id: string }> {
  const providerData = JSON.stringify({ hashedPassword: account.hashedPassword })
  const user = await tx.user.create({
    data: {
      displayName: account.displayName,
      fleetAdmin,
      auth: { create: { identities: { create: { providerName: 'username', providerUserId: account.username, providerData } } } },
    },
  })
  await tx.userSettings.create({ data: { userId: user.id, role, config: {} } })
  return { id: user.id }
}

async function usernameTaken(tx: Prisma.TransactionClient, username: string): Promise<boolean> {
  const existing = await tx.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } },
  })
  return existing !== null
}

async function acceptFirstAdmin(invite: Invite, account: { username: string; hashedPassword: string; displayName: string }): Promise<AcceptResult> {
  // Two simultaneous requests must not both see an empty user table and each create
  // an admin. The advisory lock serialises them: the second waits for the first to
  // commit, and its count (a fresh snapshot under read committed) then sees the user.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockFirstAdmin(tx)
    if ((await tx.user.count()) > 0) return 'closed' as const
    const fresh = await tx.invite.findUnique({ where: { id: invite.id } })
    if (!fresh || fresh.revokedAt || fresh.consumedAt) return 'closed' as const
    if (await usernameTaken(tx, account.username)) return 'taken' as const
    const user = await createUserWithRole(tx, account, 'ADMIN', true)
    await tx.invite.update({ where: { id: invite.id }, data: { consumedAt: new Date(), consumedBy: user.id } })
    return user
  })
  if (outcome === 'closed') {
    const problem = await inviteRefusal((await prisma.invite.findUnique({ where: { id: invite.id } })) ?? invite)
    return problem
      ? { error: problem.error, status: problem.status, reason: problem.reason }
      : { error: UNKNOWN_CODE, status: 410, reason: 'expired' }
  }
  if (outcome === 'taken') return takenError(account.username)
  await ensurePersonalProjectAfterSignup(outcome.id)
  return { success: true, landAt: SETUP_PATH }
}

async function acceptInvitation(invite: Invite, account: { username: string; hashedPassword: string; displayName: string }): Promise<AcceptResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    // Re-validate the invite inside the transaction to prevent concurrent consumption.
    const fresh = await tx.invite.findUnique({ where: { id: invite.id } })
    if (!fresh || fresh.consumedAt || fresh.revokedAt) return 'gone' as const
    if (await usernameTaken(tx, account.username)) return 'taken' as const

    const user = await createUserWithRole(tx, account, fresh.role as Role)
    await tx.invite.update({ where: { id: fresh.id }, data: { consumedAt: new Date(), consumedBy: user.id } })

    // The projects it names, as a Member — those that still exist and are not someone's own —
    // each pinned for them, in the order the admin named them.
    const rows = await tx.project.findMany({
      where: { id: { in: fresh.projectIds }, personalOwnerId: null },
      select: { id: true, key: true },
    })
    const byId = new Map(rows.map(r => [r.id, r]))
    const projects = fresh.projectIds.flatMap(id => byId.get(id) ?? [])
    await tx.projectMember.createMany({
      data: projects.map(p => ({ projectId: p.id, userId: user.id, role: 'MEMBER' as const })),
      skipDuplicates: true,
    })
    await tx.pin.createMany({
      data: projects.map((p, position) => ({ userId: user.id, kind: 'PROJECT' as const, itemId: p.id, position })),
      skipDuplicates: true,
    })
    return { user, firstKey: projects[0]?.key ?? null }
  })
  if (outcome === 'gone') return { error: 'This invitation has already been used.', status: 410, reason: 'used' }
  if (outcome === 'taken') return takenError(account.username)
  await ensurePersonalProjectAfterSignup(outcome.user.id)
  return { success: true, landAt: outcome.firstKey ? `/projects/${outcome.firstKey}` : '/' }
}

export async function acceptInviteToken(input: AcceptInput): Promise<AcceptResult> {
  let displayName: string | null
  try {
    displayName = normaliseDisplayName(input.name)
  } catch (err) {
    return { error: (err as Error).message, status: 400, reason: 'name' }
  }
  if (!displayName) return { error: 'Enter your name', status: 400, reason: 'name' }

  const invite = await findInvite(input.token)
  if (!invite) return { error: UNKNOWN_CODE, status: 404, reason: 'unknown' }
  const problem = await inviteRefusal(invite)
  if (problem) return { error: problem.error, status: problem.status, reason: problem.reason }

  // Hashed before the transaction — CPU work, not a database operation.
  // Wasp's login looks the typed name up lower-cased, so it is stored that way.
  const account = { username: input.username.toLowerCase(), hashedPassword: await hashPassword(input.password), displayName }
  return invite.kind === 'FIRST_ADMIN' ? acceptFirstAdmin(invite, account) : acceptInvitation(invite, account)
}
