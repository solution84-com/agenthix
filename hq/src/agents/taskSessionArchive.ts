/**
 * Archives a finished task's session on both sides: site's authoritative row
 * through the channel, then hq's copy. Only ever the task's own session — the
 * terminal frame names a session, and a site that owns the task must not be
 * able to archive any other session by naming it. A session that cannot
 * be confirmed as the task's own is left alone.
 *
 * Ordered, not parallel: hq's copy is replication-after-command (spec D3). It
 * mirrors what site's row already did, so it never flips ARCHIVED when the
 * site-side archive failed — a mismatched mirror is worse than a stale one.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'

const logger = new Logger('TaskRunner')

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function archiveTaskSession(siteId: string, taskId: string, sessionId: string, finalState: string): Promise<void> {
  let session: { taskId: string | null } | null
  try {
    session = await prisma.agentSession.findUnique({ where: { id: sessionId }, select: { taskId: true } })
  } catch (err) {
    logger.warn(`TaskRunner: could not read session ${sessionId} to confirm it belongs to task ${taskId} — nothing archived: ${describeError(err)}`)
    return
  }
  if (session?.taskId !== taskId) {
    logger.warn(`TaskRunner: terminal frame for task ${taskId} names session ${sessionId}, which is not that task's session — nothing archived`)
    return
  }

  try {
    await siteRuntimeStore.archiveSession(siteId, sessionId)
  } catch (err) {
    logger.warn(`TaskRunner: site-side session archive failed for ${sessionId} — hq's copy left unarchived: ${describeError(err)}`)
    return
  }
  await prisma.agentSession
    .update({ where: { id: sessionId }, data: { status: 'ARCHIVED' } })
    .catch((err: unknown) => logger.warn(`TaskRunner: hq-copy session archive failed for ${sessionId}: ${describeError(err)}`))
  logger.info(`TaskRunner: session ${sessionId} archived — task ${taskId} finished as ${finalState}`)
}

/**
 * Archives hq's copy of a task's session with no site involved, for a site
 * that is gone for good: `archiveTaskSession` above asks the site first and
 * leaves hq's copy alone when it cannot, which is right for a site that will
 * answer later and wrong for one that never will. A task has at most one
 * session (`AgentSession.taskId` is unique), so this is one row, or none.
 */
export async function archiveTaskSessionOnHq(taskId: string): Promise<void> {
  const session = await prisma.agentSession.findUnique({ where: { taskId }, select: { id: true, status: true } })
  if (!session || session.status === 'ARCHIVED') return
  await prisma.agentSession.update({ where: { id: session.id }, data: { status: 'ARCHIVED' } })
  logger.info(`TaskRunner: session ${session.id} archived on hq alone — task ${taskId}'s site was revoked`)
}
