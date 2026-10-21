/**
 * The one way the server names a person (every screen reviewed spec §3,
 * People): `personSummary.ts`'s rule over their row. Every read that shows a
 * person goes through here, so a display name, a picture and having left or
 * been erased read the same everywhere.
 */
import { prisma } from 'wasp/server'
import { PERSON_SELECT, missingPerson, personSummary, type PersonSummary } from './personSummary'

export async function peopleByIds(userIds: readonly string[]): Promise<Map<string, PersonSummary>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: PERSON_SELECT })
  const found = new Map(rows.map(r => [r.id, personSummary(r)]))
  return new Map(ids.map(id => [id, found.get(id) ?? missingPerson(id)]))
}

export async function personById(userId: string): Promise<PersonSummary> {
  return (await peopleByIds([userId])).get(userId) ?? missingPerson(userId)
}

/** A person who may still act and be chosen: their account exists and has not left (adr-0100). */
export async function isActivePerson(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } })
  return row !== null && row.deactivatedAt === null
}

/** The `where` that keeps only people who are still here, for pickers and counts. */
export const ACTIVE_PERSON = { deactivatedAt: null } as const
