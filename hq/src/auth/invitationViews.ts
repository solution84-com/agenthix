/**
 * Invitations as Organisation › People lists them (every screen reviewed spec
 * §3, People): who each is for, who sent it, its role and the projects the
 * person joins on accepting, and its state. Waiting ones first; used, expired
 * and revoked ones under earlier invitations. The token is never returned —
 * only its hash is stored, and the link is shown once, at creation.
 *
 * A project the viewing admin cannot see — a private one they are not in — is
 * counted, never named.
 */
import { prisma } from 'wasp/server'
import { peopleByIds } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'

export type InvitationState = 'waiting' | 'used' | 'expired' | 'revoked'

export type InvitationView = {
  id: string
  /** The note the admin wrote: who it is for. */
  forWhom: string | null
  role: 'ADMIN' | 'MEMBER'
  /** Null when it was made on hq's machine: "Invited from HQ's machine". */
  invitedBy: PersonSummary | null
  fromHqMachine: boolean
  createdAt: Date
  expiresAt: Date | null
  state: InvitationState
  /** Who accepted it, when used. */
  usedBy: PersonSummary | null
  usedAt: Date | null
  projects: { id: string; key: string; name: string }[]
  /** Projects it names that the viewer cannot see, or that no longer exist. */
  hiddenProjectCount: number
}

export function invitationState(i: { consumedAt: Date | null; revokedAt: Date | null; expiresAt: Date | null }, now: Date): InvitationState {
  if (i.consumedAt) return 'used'
  if (i.revokedAt) return 'revoked'
  if (i.expiresAt && i.expiresAt < now) return 'expired'
  return 'waiting'
}

export async function invitationViews(viewerId: string): Promise<{ waiting: InvitationView[]; earlier: InvitationView[] }> {
  // The first-admin link is not an invitation anyone sends, so it is never listed.
  const invites = await prisma.invite.findMany({ where: { kind: 'INVITATION' }, orderBy: { createdAt: 'desc' } })
  const projectIds = [...new Set(invites.flatMap(i => i.projectIds))]
  const [projects, people] = await Promise.all([
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
        personalOwnerId: null,
        OR: [{ accessLevel: 'OPEN' }, { members: { some: { userId: viewerId } } }],
      },
      select: { id: true, key: true, name: true },
    }),
    peopleByIds(invites.flatMap(i => [i.createdBy, i.consumedBy].filter((id): id is string => !!id))),
  ])
  const visible = new Map(projects.map(p => [p.id, p]))
  const now = new Date()
  const views = invites.map((i): InvitationView => {
    const named = i.projectIds.map(id => visible.get(id)).filter((p): p is { id: string; key: string; name: string } => !!p)
    return {
      id: i.id,
      forWhom: i.note,
      role: i.role,
      invitedBy: i.createdBy ? people.get(i.createdBy)! : null,
      fromHqMachine: i.createdBy === null,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      state: invitationState(i, now),
      usedBy: i.consumedBy ? people.get(i.consumedBy)! : null,
      usedAt: i.consumedAt,
      projects: named,
      hiddenProjectCount: i.projectIds.length - named.length,
    }
  })
  return { waiting: views.filter(v => v.state === 'waiting'), earlier: views.filter(v => v.state !== 'waiting') }
}
