/**
 * The conversation a version was proposed in, for the Versions tab and the review ("Proposed by Kernel in …"): the
 * operation that ran the proposing agent's run. Only a conversation the reader may read is named; for anyone else the
 * line says no more than who proposed it.
 */
import { prisma } from 'wasp/server'
import { requireConversationReader } from '../conversations/readingRule'

export type ProposedIn = { conversationId: string; title: string | null }

export async function proposingConversations(runIds: (string | null)[], userId: string): Promise<Map<string, ProposedIn>> {
  const ids = [...new Set(runIds.filter((r): r is string => !!r))]
  if (ids.length === 0) return new Map()
  const ops = await prisma.operation.findMany({
    where: { runId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: { runId: true, conversationId: true, conversation: { select: { title: true } } },
  })
  const readable = new Map<string, boolean>()
  const mayRead = async (conversationId: string) => {
    const held = readable.get(conversationId)
    if (held !== undefined) return held
    const ok = await requireConversationReader(conversationId, userId).then(() => true, () => false)
    readable.set(conversationId, ok)
    return ok
  }
  const found = new Map<string, ProposedIn>()
  for (const op of ops) {
    if (!op.runId || found.has(op.runId) || !(await mayRead(op.conversationId))) continue
    found.set(op.runId, { conversationId: op.conversationId, title: op.conversation.title })
  }
  return found
}
