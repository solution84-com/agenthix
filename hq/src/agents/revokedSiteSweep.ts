/**
 * Fails every task held for, or running on, a site that was just revoked. A
 * revoked site's channel is closed at once and it never reconnects, so its
 * runs report nothing further and neither reconcile nor drainHeldTasks ever
 * reaches them — without this they stay RUN_ACTIVE and occupy their (agent,
 * project) slot forever. Each write goes through the task's own frame chain
 * and only applies while the task is still in the state read here, so a
 * terminal frame that slipped in before the socket closed wins instead.
 *
 * A task whose site cannot be resolved at all is failed here too, for the
 * same reason rather than the same cause: it can no longer dispatch
 * anywhere, so leaving it RUN_ACTIVE holds its slot — and everything queued
 * behind it for that agent and project — permanently. It says so in its
 * reason instead.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import * as dispatchService from './dispatchService'
import { enqueueForTask } from './taskFrameChain'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { archiveTaskSessionOnHq } from './taskSessionArchive'
import { HELD_FOR_RECONNECT_REASON, SITE_REVOKED_REASON, UNPLACEABLE_REASON } from './taskExecutionReasons'

const logger = new Logger('TaskRunner')

type TriggerNext = (agent: Agent, projectId: string | null) => Promise<void>

type StuckTask = { id: string; runState: string; projectId: string; assignedAgent: Agent | null }

export async function failTasksForRevokedSite(siteId: string, triggerNext: TriggerNext): Promise<void> {
  // Only this site's projects, plus the ones that name no site at all — those
  // can never dispatch anywhere, which is the unplaceable case below. A task
  // on any other site is none of this sweep's business.
  const candidates = await prisma.task.findMany({
    where: {
      AND: [
        {
          OR: [
            { runState: 'RUN_ACTIVE' },
            { runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON },
          ],
        },
        { OR: [{ project: { executionSite: { siteId } } }, { project: { executionSiteId: null } }] },
      ],
    },
    select: { id: true, runState: true, projectId: true, assignedAgent: true },
  })
  // One trigger per (agent, project) once every write has landed. Triggering
  // per failed task would step the same next task up twice, and would step it
  // up while a sibling on the revoked site still read as RUN_ACTIVE.
  const freedSlots = new Map<string, { agent: Agent; projectId: string }>()
  for (const task of candidates) {
    let taskSiteId: string
    try {
      taskSiteId = await dispatchService.resolveSiteIdForTask(task.id)
    } catch (err) {
      // Only a SETTLED refusal — the resolvers raise HttpError when there is
      // no site to name — says this task can never dispatch. A dropped
      // connection mid-sweep says nothing about the task at all: failing on
      // one would permanently kill a task that may be running healthily.
      // Skipped, as it was before this branch existed.
      if (!(err instanceof HttpError)) {
        logger.error(
          `TaskRunner: could not resolve a site for task ${task.id} during the revoked-site sweep (${err instanceof Error ? err.message : String(err)}) — left as it is`,
        )
        continue
      }
      logger.warn(
        `TaskRunner: task ${task.id} has no resolvable Execution Site (${err.message}) — failing it rather than leaving its slot held`,
      )
      await failStuckTask(task, UNPLACEABLE_REASON, false)
        .then((freed) => noteFreedSlot(freedSlots, task, freed))
        .catch((failErr) => {
          logger.error(`TaskRunner: failing unplaceable task ${task.id} failed: ${failErr instanceof Error ? failErr.message : String(failErr)}`)
        })
      continue
    }
    if (taskSiteId !== siteId) continue
    try {
      noteFreedSlot(freedSlots, task, await failStuckTask(task, SITE_REVOKED_REASON, true))
    } catch (err) {
      logger.error(`TaskRunner: failing task ${task.id} for revoked site ${siteId} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  for (const { agent, projectId } of freedSlots.values()) {
    await triggerNext(agent, projectId).catch((err) => {
      logger.error(`TaskRunner: trigger-next for agent ${agent.handle} in project ${projectId} after the revoked-site sweep failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }
}

function noteFreedSlot(
  freedSlots: Map<string, { agent: Agent; projectId: string }>,
  task: StuckTask,
  freed: boolean,
): void {
  if (freed && task.assignedAgent) freedSlots.set(`${task.assignedAgent.id}:${task.projectId}`, { agent: task.assignedAgent, projectId: task.projectId })
}

/**
 * The conditional write both branches above share. Goes through the task's
 * own frame chain and only applies while the task is still in the state it
 * was read in, so a terminal frame that arrived in between wins instead.
 * Resolves whether the write freed a running task's slot.
 *
 * `siteGone` archives hq's copy of the task's session: the site that would
 * archive its own row and then ask hq to mirror it is never coming back, and
 * a late terminal frame that would have archived it cannot arrive either.
 * A task failed as unplaceable had no revoked site under it, so its session
 * is not touched.
 */
async function failStuckTask(task: StuckTask, reason: string, siteGone: boolean): Promise<boolean> {
  const running = task.runState === 'RUN_ACTIVE'
  let freed = false
  await enqueueForTask(task.id, async () => {
    const { count } = await prisma.task.updateMany({
      where: running
        ? { id: task.id, runState: 'RUN_ACTIVE' }
        : { id: task.id, runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON },
      data: { runState: 'RUN_FAILED', runStateReason: reason },
    })
    if (count === 0) return
    await notifyBoardsOfTasks([task.id])
    freed = running
    if (siteGone) {
      await archiveTaskSessionOnHq(task.id).catch((err) => {
        logger.warn(`TaskRunner: could not archive hq's copy of task ${task.id}'s session: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  })
  return freed
}
