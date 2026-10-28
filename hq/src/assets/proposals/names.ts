import type { Db } from '../../packages/packageStore'
import { missingPerson, PERSON_SELECT, personSummary } from '../../server/identity/personSummary'

/** How a person is named on a card or in a note. */
export async function personName(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const row = await db.user.findUnique({ where: { id: userId }, select: PERSON_SELECT })
  return (row ? personSummary(row) : missingPerson(userId)).name
}

export async function agentName(db: Db, agentId: string | null): Promise<string | null> {
  if (!agentId) return null
  return (await db.agent.findUnique({ where: { id: agentId }, select: { name: true } }))?.name ?? 'An agent'
}
