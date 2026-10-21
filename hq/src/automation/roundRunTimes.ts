/**
 * How long each round's latest run took (spec §3, a routine's rounds). Runs are
 * the Execution Site's data, so this asks the sites, once for all the rounds;
 * a site that does not answer leaves its rounds' times unknown, and the
 * routine still reads.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import { withLatestRuns } from '../runs/myRuns'

const logger = new Logger('RoundRunTimes')

export async function roundRunTimes(taskIds: string[]): Promise<Map<string, number>> {
  const took = new Map<string, number>()
  if (taskIds.length === 0) return took
  try {
    const sessions = await prisma.agentSession.findMany({
      where: { taskId: { in: taskIds } },
      select: {
        id: true, taskId: true, agentId: true, userId: true, sessionType: true,
        primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true,
      },
    })
    for (const { session, latest } of await withLatestRuns(sessions)) {
      if (!session.taskId || !latest?.startedAt || !latest.endedAt) continue
      took.set(session.taskId, Math.max(0, new Date(latest.endedAt).getTime() - new Date(latest.startedAt).getTime()))
    }
  } catch (err) {
    logger.warn(`reading rounds' run times failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return took
}
