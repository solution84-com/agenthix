/**
 * What an invitation page may show of the organisation besides its identity
 * (onboarding's Join step): a few people already in it, and the projects the
 * person is joining with how many people each has. Faces and names only —
 * nothing from inside a project. Read only by someone holding a working code.
 */
import { prisma } from 'wasp/server'
import { ACTIVE_PERSON } from '../server/identity/people'
import { PERSON_SELECT, personSummary } from '../server/identity/personSummary'
import type { Role } from './inviteService'

export const GLIMPSE_PEOPLE = 4

export type GlimpsePerson = { name: string; role: Role }

export type InvitedProject = { key: string; name: string; description: string | null; memberCount: number }

export async function glimpseOfPeople(): Promise<{ people: GlimpsePerson[]; morePeople: number }> {
  const where = { ...ACTIVE_PERSON, erasedAt: null }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { ...PERSON_SELECT, settings: { select: { role: true } } },
      orderBy: [{ settings: { role: 'asc' } }, { id: 'asc' }],
      take: GLIMPSE_PEOPLE,
    }),
    prisma.user.count({ where }),
  ])
  const people = rows.map(r => ({ name: personSummary(r).name, role: (r.settings?.role ?? 'MEMBER') as Role }))
  return { people, morePeople: Math.max(0, total - people.length) }
}

/** The projects an invitation names, in the order named, those that still exist and are not someone's own. */
export async function invitedProjects(projectIds: string[]): Promise<InvitedProject[]> {
  if (projectIds.length === 0) return []
  const rows = await prisma.project.findMany({
    where: { id: { in: projectIds }, personalOwnerId: null },
    select: { id: true, key: true, name: true, description: true, _count: { select: { members: true } } },
  })
  const byId = new Map(rows.map(r => [r.id, r]))
  return projectIds.flatMap(id => {
    const row = byId.get(id)
    return row ? [{ key: row.key, name: row.name, description: row.description, memberCount: row._count.members }] : []
  })
}
