import { prisma } from 'wasp/server'

/** An agent's name for a message a person reads, where the code holds only its id; null when it has none on record. */
export async function agentNameFor(agentId: string, db: Pick<typeof prisma, 'agent'> = prisma): Promise<string | null> {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  return agent?.name ?? null
}

/** `"Scout"`, or "That agent" when the name is not known. */
export const agentCalled = (name: string | null): string => (name ? `"${name}"` : 'That agent')
