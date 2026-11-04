/**
 * Reading an invitation before accepting it (getting-in spec, Accepting an
 * invitation): the organisation, who invited them, the role and the projects it
 * adds. The first-admin link is read the same way. Accepting is
 * `inviteAccept.ts`.
 */
import { prisma } from 'wasp/server'
import type { Invite } from '@prisma/client'
import { resetRateLimit } from '../server/rateLimit'
import { hashInviteToken } from './inviteToken'
import { personById } from '../server/identity/people'
import { openFirstAdminKey } from './firstAdmin'
import { glimpseOfPeople, invitedProjects, type GlimpsePerson, type InvitedProject } from './inviteGlimpse'
import { readOrgCard, readPublicOrgIdentity, type PublicOrgIdentity } from '../org/publicIdentity'
import { BRANDING } from '@agenthix/core'

export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, isInviteRateLimited, recordFailedInviteAttempt } from './inviteLimit'

/** A refusal of the code itself — not found, revoked, used, expired — as opposed to a refusal of the form. */
export function isCodeRefusal(status: number): boolean {
  return status === 404 || status === 410
}

export async function resetRateLimiter(ip?: string): Promise<void> {
  await resetRateLimit(ip)
}

// ── Types ───────────────────────────────────────────────────────────────────
export type Role = 'ADMIN' | 'MEMBER'
const VALID_ROLES: Role[] = ['ADMIN', 'MEMBER']

/** Why a code was refused, so each problem screen can say it plainly. */
export type InviteRefusal = 'unknown' | 'expired' | 'used' | 'revoked' | 'already_set_up' | 'bad_role'

export type InvitationView = {
  /** The first-admin link opens setup; an invitation opens the invitation page. */
  kind: 'first_admin' | 'invitation'
  role: Role
  /** Who it is for, as the admin wrote it. */
  note: string | null
  /** Who invited them; null for the first admin and for an invitation made on hq's machine. */
  invitedBy: { name: string; handle: string | null } | null
  fromHqMachine: boolean
  /** The projects it adds, in the order the admin named them; the first is where they land. */
  projects: InvitedProject[]
  /** A few people already in the organisation, and how many more; empty for the first-admin link. */
  people: GlimpsePerson[]
  morePeople: number
  /** Neither the organisation nor their projects give model access, so onboarding will ask for the person's own (it sets the step count). */
  needsModel: boolean
  expiresAt: string | null
  org: PublicOrgIdentity
}

export type Refused = {
  valid: false
  status: number
  reason: InviteRefusal
  error: string
  /** Whom to ask for a new invitation, when the code was real but no longer works. */
  askWho: string | null
}

export type ValidateResult = ({ valid: true } & InvitationView) | Refused

const refused = (status: number, reason: InviteRefusal, error: string, askWho: string | null = null): Refused =>
  ({ valid: false, status, reason, error, askWho })

export const UNKNOWN_CODE = "This invitation link doesn't work."

/** The state of a known invitation row: why it is refused, or null while it can be accepted. */
export async function inviteRefusal(invite: Invite, now = new Date()): Promise<Refused | null> {
  if (invite.kind === 'FIRST_ADMIN') {
    if ((await prisma.user.count()) > 0) {
      const org = await readOrgCard()
      return refused(410, 'already_set_up', `${org.name}'s HQ is already set up.`)
    }
    if (invite.revokedAt || (invite.expiresAt && invite.expiresAt <= now)) {
      return refused(410, 'expired', `This setup link no longer works. Run ./${BRANDING.cliCommand} invite-admin on HQ's machine for a new one.`)
    }
    return null
  }
  const askWho = await inviterName(invite)
  if (invite.revokedAt) return refused(410, 'revoked', 'This invitation was withdrawn.', askWho)
  if (invite.consumedAt) return refused(410, 'used', 'This invitation has already been used.', askWho)
  if (invite.expiresAt && invite.expiresAt < now) return refused(410, 'expired', 'This invitation has expired.', askWho)
  if (!VALID_ROLES.includes(invite.role as Role)) return refused(500, 'bad_role', 'This invitation has a role hq does not know.')
  return null
}

async function inviterName(invite: Invite): Promise<string | null> {
  if (!invite.createdBy) return null
  const inviter = await personById(invite.createdBy)
  return inviter.state === 'erased' ? null : inviter.name
}

/** The invitation row a token names, the open first-admin key compared in constant time first. */
export async function findInvite(token: string): Promise<Invite | null> {
  return (await openFirstAdminKey(token)) ?? prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
}

export async function validateToken(token: string): Promise<ValidateResult> {
  const invite = await findInvite(token)
  if (!invite) return refused(404, 'unknown', UNKNOWN_CODE)
  const problem = await inviteRefusal(invite)
  if (problem) return problem

  const inviter = invite.createdBy ? await personById(invite.createdBy) : null
  const firstAdmin = invite.kind === 'FIRST_ADMIN'
  const [projects, org, glimpse] = await Promise.all([
    invitedProjects(invite.projectIds),
    readPublicOrgIdentity(),
    firstAdmin ? { people: [], morePeople: 0 } : glimpseOfPeople(),
  ])
  return {
    valid: true,
    kind: firstAdmin ? 'first_admin' : 'invitation',
    role: invite.role as Role,
    note: invite.note,
    invitedBy: inviter && inviter.state !== 'erased' ? { name: inviter.name, handle: inviter.handle } : null,
    fromHqMachine: invite.kind === 'INVITATION' && invite.createdBy === null,
    projects,
    ...glimpse,
    // Models are the organisation admins' to supply (models from one place): never a step of joining.
    needsModel: false,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    org,
  }
}
