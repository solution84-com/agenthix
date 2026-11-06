/**
 * Scheduled tasks (spec §3). A start time is a Run a person asked for later:
 * it does not wait for the pulse, and it starts the task once, in whatever
 * column it is in. When it falls due the scheduler starts it through
 * `TaskRunner.runTask` with `startedBy: 'schedule'`. Only something real delays
 * it — its agent already running a task in the project (it stays queued, asked
 * to start, goes next and says so) — and with the boundary's automation off it
 * is queued for the pulse instead and waits for a person, or for the pulse once
 * automation is back on. Either way it is at depth 0: a person set the time
 * (adr-0091). A time that fell due while hq was down starts when hq is back.
 *
 * A task starts at most once (adr-0092); repeating work is a routine, whose
 * round's time is a start time like any other when it comes (routineRounds.ts,
 * adr-0104): it starts here, on behalf of the routine's person.
 */
import { prisma } from 'wasp/server'
import { Prisma, type Agent, type Task } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { taskRunner } from '../agents/TaskRunner'
import { AUTOMATION_OFF_REASON, NO_AGENT_REASON } from '../agents/taskExecutionReasons'
import { effectiveAutomation, type OrgAutomation } from './automationSettings'
import { choiceOf } from './automationStore'
import type { StartedEntry } from './pulse'
import { dueBy } from './pulsePlan'
import { personQueuer } from '../projects/taskOnBehalfOf'
import { askedToStart, queuedForPulse } from '../projects/taskQueueing'

const logger = new Logger('ScheduledStart')

export { AUTOMATION_OFF_REASON, NO_AGENT_REASON }

export const SCHEDULED_START_REASON = 'scheduled start'

/** A scheduled time reached while the task's last run waits for a person. */
export const NEEDS_PERSON_REASON = 'its last run needs a person'

/** Starts every scheduled task due by `now`, each claimed once by compare-and-set on its due time. */
export async function startSchedulesDue(org: OrgAutomation, now: Date): Promise<number> {
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
      await startScheduledTask(task, org)
      started++
    } catch (err) {
      logger.error(`scheduled start of task ${task.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return started
}

async function startScheduledTask(task: Task & { assignedAgent: Agent | null }, org: OrgAutomation): Promise<void> {
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
    await record(task, agent, { outcome: 'failed', reason: `${NEEDS_PERSON_REASON}${task.runStateReason ? `: ${task.runStateReason}` : ''}` })
    return
  }

  const row = await prisma.projectAutomation.findUnique({ where: { projectId: task.projectId } })
  const eff = effectiveAutomation(org, choiceOf(row))
  // Queued on behalf of the person behind the schedule (adr-0089), only from no
  // run pending or one already queued — never over a run that started meanwhile.
  const queuer = personQueuer(task.scheduleSetByUserId ?? task.onBehalfOfUserId)
  if (!eff.enabled) {
    // Left for a person or the pulse — but never over a start someone already asked for.
    await prisma.task.updateMany({
      where: { id: task.id, isEpic: false, OR: [{ runState: 'RUN_NONE' }, { runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, runStartedBy: null }] },
      data: await queuedForPulse(task.projectId, queuer, 0, AUTOMATION_OFF_REASON),
    })
    await boardChanged(task.boardId)
    await record(task, agent, { outcome: 'queued' })
    return
  }

  const { count } = await prisma.task.updateMany({
    where: { id: task.id, isEpic: false, runState: { in: ['RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED'] } },
    data: askedToStart('schedule', queuer, SCHEDULED_START_REASON),
  })
  if (count === 0) return
  await boardChanged(task.boardId)
  const { outcome, reason } = await taskRunner.runTask(task.id, agent, 'schedule')
  if (outcome !== 'skipped') await record(task, agent, { outcome, reason })
}

async function record(task: Task, agent: Agent, result: { outcome: StartedEntry['outcome']; reason?: string }): Promise<void> {
  const entry: StartedEntry = {
    taskId: task.id, title: task.title, agentId: agent.id, agentHandle: agent.handle, outcome: result.outcome,
    ...(result.reason ? { reason: result.reason } : {}),
  }
  await prisma.automationStart.create({
    data: { projectId: task.projectId, kind: 'SCHEDULE', taskId: task.id, started: [entry] as unknown as Prisma.InputJsonValue },
  })
}

async function boardChanged(boardId: string | null): Promise<void> {
  if (!boardId) return
  const { emitTaskUpdated } = await import('../server/socket')
  emitTaskUpdated(boardId)
}
