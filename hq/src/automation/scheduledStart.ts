/**
 * Scheduled tasks (spec D6, adr-0175). A start time is a person's Run asked for
 * later: when it falls due the scheduler starts the task through
 * `TaskRunner.runTask` with `startedBy: 'schedule'`, once, in whatever column it
 * is in. Only something real delays it — its agent already running a task in
 * the project (it joins the agent's line, goes next in rank order and says so),
 * or its site's limit on runs at once. It is at depth 0: a person set the time
 * (adr-0091). A time that fell due while hq was down starts when hq is back.
 *
 * A task starts at most once; repeating work is a routine, which makes no task
 * and fires on its own (routineFiring.ts, adr-0177).
 */
import { prisma } from 'wasp/server'
import type { Agent, Task } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { taskRunner } from '../agents/TaskRunner'
import { NO_AGENT_REASON } from '../agents/taskExecutionReasons'
import { dueBy } from './dueTime'
import { personQueuer } from '../projects/taskOnBehalfOf'
import { askedToStart } from '../projects/taskQueueing'

const logger = new Logger('ScheduledStart')

export { NO_AGENT_REASON }

export const SCHEDULED_START_REASON = 'scheduled start'

/** A scheduled time reached while the task's last run waits for a person. */
export const NEEDS_PERSON_REASON = 'its last run needs a person'

/** Starts every scheduled task due by `now`, each claimed once by compare-and-set on its due time. */
export async function startSchedulesDue(now: Date): Promise<number> {
  const due = await prisma.task.findMany({
    where: { scheduleNextDueAt: { lte: dueBy(now) }, archived: false },
    include: { assignedAgent: true },
    orderBy: { scheduleNextDueAt: 'asc' },
    take: 200,
  })
  let started = 0
  for (const task of due) {
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, scheduleNextDueAt: task.scheduleNextDueAt },
      data: { scheduleNextDueAt: null },
    })
    if (count === 0) continue
    try {
      await startScheduledTask(task)
      started++
    } catch (err) {
      logger.error(`scheduled start of task ${task.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return started
}

async function startScheduledTask(task: Task & { assignedAgent: Agent | null }): Promise<void> {
  // Already under way (a person pressed Run before its time): that run is its start.
  if (task.runState === 'RUN_ACTIVE') return

  const agent = task.assignedAgent
  if (!agent) {
    await prisma.task.update({ where: { id: task.id }, data: { runStateReason: NO_AGENT_REASON } })
    await boardChanged(task.boardId)
    return
  }

  // A failed or blocked run waits for a person (spec §6): its time passing does
  // not clear it. That includes a task blocked because its person lost access,
  // which only a project admin releases (adr-0089).
  if (task.runState === 'RUN_FAILED' || task.runState === 'RUN_BLOCKED') {
    logger.info(`scheduled start of task ${task.id} not made: ${NEEDS_PERSON_REASON}`)
    return
  }

  // Queued on behalf of the person behind the schedule (adr-0089), only from no
  // run pending or one already queued — never over a run that started meanwhile.
  const queuer = personQueuer(task.scheduleSetByUserId ?? task.onBehalfOfUserId)
  const { count } = await prisma.task.updateMany({
    where: { id: task.id, isEpic: false, archived: false, runState: { in: ['RUN_NONE', 'RUN_QUEUED'] } },
    data: askedToStart('schedule', queuer, SCHEDULED_START_REASON),
  })
  if (count === 0) return
  await boardChanged(task.boardId)
  await taskRunner.runTask(task.id, agent, 'schedule')
}

async function boardChanged(boardId: string | null): Promise<void> {
  if (!boardId) return
  const { emitTaskUpdated } = await import('../server/socket')
  emitTaskUpdated(boardId)
}
