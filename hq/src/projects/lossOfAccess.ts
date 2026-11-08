/**
 * When a person loses access to a project, every unfinished task done on their
 * behalf there is blocked at once (adr-0089). A running one is stopped, unless
 * the caller lets a run in progress finish first — removing someone from a
 * project or the organisation does (spec §3, People): the finished run leaves
 * the task blocked, since a run settles only a task still marked running
 * (taskStatusListener.ts). It stays blocked until a project admin chooses
 * someone else (`setTaskOnBehalfOf`); nothing hands it on automatically.
 *
 * Their routines in the project pause too (spec §3): the waiting round stays,
 * blocked with the rest, until a project admin takes the routine over.
 *
 * Called after the change that ended the access has committed, so it never
 * throws: a task it fails to block is still held back at its next start,
 * because dispatch checks the person's access itself (dispatchService.ts).
 */
import { notifyProjectBoards } from './boardNotify'
import { withExecutionState } from './executionState'
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { LOST_ACCESS_REASON } from './taskOnBehalfOf'
import { pauseRoutinesForLostAccess } from '../automation/routines'

const logger = new Logger('LossOfAccess')

/** Whose access ended, and where: one person, or everyone not in a list; in one project, or all. */
export type LostAccessScope = { projectId?: string; onBehalfOfUserId: string | { notIn: string[] } }

/** Blocks the unfinished tasks `where` selects, and pauses the routines; returns how many tasks. */
export async function blockTasksForLostAccess(
  where: LostAccessScope,
  options: { stopActiveRuns?: boolean } = {},
): Promise<number> {
  const stopActiveRuns = options.stopActiveRuns ?? true
  await pauseRoutinesForLostAccess(where).catch(err => logger.error('failed to pause routines whose person lost access', err))
  try {
    const tasks = await prisma.task.findMany({
      where: { AND: [where, { archived: false, state: { not: 'DONE' } }] },
      select: { id: true, runState: true, projectId: true },
    })
    if (tasks.length === 0) return 0

    // The block is written before any run is cancelled: the cancelled run's
    // status frame can reach hq first, and the status listener then finds the
    // run already settled and leaves the task blocked.
    await prisma.task.updateMany({
      where: { id: { in: tasks.map(t => t.id) } },
      data: withExecutionState({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON }),
    })
    if (stopActiveRuns) {
      for (const task of tasks) {
        if (task.runState === 'RUN_ACTIVE') await stopRunsOf(task.id)
      }
    }

    await notifyProjectBoards(tasks.map(t => t.projectId))
    triggerSnapshotPush()
    return tasks.length
  } catch (err) {
    logger.error('failed to block tasks whose person lost access', err)
    return 0
  }
}

async function stopRunsOf(taskId: string): Promise<void> {
  try {
    const siteId = await dispatchService.resolveSiteIdForTask(taskId)
    const runs = await siteRuntimeStore.listRuns(siteId, { taskId, activeOnly: true })
    for (const run of runs) await siteRuntimeStore.cancelRun(siteId, run.id)
  } catch (err) {
    // An unreachable site keeps the run going until it ends on its own; the
    // task is already blocked, and its end changes nothing (taskStatusListener.ts).
    logger.warn(`could not stop the run of task ${taskId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
