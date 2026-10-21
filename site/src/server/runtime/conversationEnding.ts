/**
 * Ending conversations when they are deleted or their person leaves (adr-0083,
 * spec §3): each one's processes, harness, staging and platform token go with
 * it (conversationLifecycle.ts). Read before the rows go, since the runtime a
 * conversation started with is on its row (adr-0078).
 *
 * Never rejects for one conversation that could not be let go of: the lifecycle
 * logs it, and removing the container remains the backstop.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '#db'
import { conversationLifecycle } from '../../agents/runtime/conversationLifecycle'

export async function endConversations(where: Prisma.AgentSessionWhereInput): Promise<void> {
  const sessions = await prisma.agentSession.findMany({ where, select: { id: true, runtime: true } })
  await Promise.all(sessions.map(session =>
    conversationLifecycle.endConversation(session.id, { runtimeName: session.runtime })))
}
