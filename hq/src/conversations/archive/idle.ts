/**
 * Archive, never prune (on-screen spec): a conversation idle for ARCHIVE_AFTER_DAYS is hidden from the list
 * and kept. Not one that was kept out of archiving, that has work or a reply going on, or that is a task's thread
 * (which archives with its task). Idle is measured from the later of its last message and its last change, so a
 * reopened conversation is not archived again the next day.
 */
import { prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES } from '../../shared/conversations/protocol'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('ConversationArchive')

export const DAY_MS = 86_400_000
export const ARCHIVE_AFTER_DAYS = 90
/** A backlog beyond this is cleared over the next sweeps rather than in one. */
const BATCH = 500

/** When a conversation must have last moved to be idle; null for a period that archives nothing. */
export function idleCutoff(now: Date, days: number): Date | null {
  if (!Number.isFinite(days) || days < 1) return null
  return new Date(now.getTime() - Math.trunc(days) * DAY_MS)
}

export async function archiveIdleConversations(now: Date = new Date()): Promise<number> {
  const cutoff = idleCutoff(now, ARCHIVE_AFTER_DAYS)
  if (!cutoff) return 0
  const idle = await prisma.conversation.findMany({
    where: {
      status: 'ACTIVE',
      keep: false,
      home: { in: ['PERSON', 'PROJECT'] },
      lastMessageAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      activeTurnId: null,
      operations: { none: { state: { in: [...OUTSTANDING_OPERATION_STATES] } } },
      messages: { none: { awaitsTurn: true, turnId: null } },
    },
    select: { id: true },
    take: BATCH,
  })
  if (idle.length === 0) return 0
  // Checked again where it is written: a message that arrived since the read keeps its conversation open.
  const { count } = await prisma.conversation.updateMany({
    where: { id: { in: idle.map(c => c.id) }, status: 'ACTIVE', keep: false, lastMessageAt: { lt: cutoff } },
    data: { status: 'ARCHIVED', archivedAt: now },
  })
  if (count > 0) logger.info(`archived ${count} idle conversation(s)`)
  return count
}
