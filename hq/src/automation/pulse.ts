/**
 * A boundary's pulse (spec §2, adr-0091): hq code, not an agent run. It makes
 * no model call; it starts queued tasks through `TaskRunner`, marked
 * `startedBy: 'pulse'`.
 *
 * With automation on, each agent's queued tasks in the project form one line,
 * and whenever the agent is free there the pulse starts the first of it. A run
 * ending starts the next task someone asked to start (TaskRunner.triggerNext)
 * and nudges the scheduler, so the pulse takes the rest of the line at once.
 *
 * With the throttle on, newly queued work is held as RUN_THROTTLED, and a
 * round, when due, lets up to the batch size of each agent's throttled tasks
 * into its line (RUN_QUEUED); they then run one after another. The round is
 * open until none of them is queued or running, and the next is due an
 * interval after it closed.
 *
 * Each round's opening and closing is a compare-and-set on the project's
 * stored state, and each start is claimed under the (agent, project) lock, so
 * overlapping ticks or two hq processes start a task once (adr-0088).
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import type { Prisma, ProjectAutomation } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { taskRunner, type RunTaskOutcome } from '../agents/TaskRunner'
import { IN_LINE } from '../agents/taskSlotClaim'
import { effectiveAutomation, type OrgAutomation } from './automationSettings'
import { choiceOf } from './automationStore'
import { notifyProjectBoards } from '../projects/boardNotify'
import { notBeforeItsTime, startableNow } from '../projects/notBeforeItsTime'
import { dueBy, pulseDueAt, roundFinished, selectBatches } from './pulsePlan'

const logger = new Logger('Pulse')

/** A task in an agent's line, which the pulse may start. */
export const PULSE_STARTABLE: Prisma.TaskWhereInput = { ...IN_LINE, assignedAgentId: { not: null } }

/** A task the throttle holds for the next round. */
export const THROTTLED: Prisma.TaskWhereInput = { runState: 'RUN_THROTTLED', archived: false, assignedAgentId: { not: null } }

/** How one start went: started, failed to start (with why), or let into its agent's line by a round. */
export type StartedEntry = {
  taskId: string
  title: string
  agentId: string
  agentHandle: string
  outcome: Exclude<RunTaskOutcome, 'skipped'> | 'queued'
  /** Why it failed to start. */
  reason?: string
}

type Json = Prisma.InputJsonValue

/** Every boundary with automation on and queued or throttled work: its lines started, and its round opened when due. */
export async function firePulsesDue(org: OrgAutomation, now: Date): Promise<number> {
  if (!org.allowed) return 0
  const rows = await prisma.projectAutomation.findMany({
    where: { enabled: true, project: { tasks: { some: { OR: [PULSE_STARTABLE, THROTTLED] } } } },
  })
  let fired = 0
  for (const row of rows) {
    try {
      if (await pulseProject(row, org, now)) fired++
    } catch (err) {
      logger.error(`pulse for project ${row.projectId} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return fired
}

/** One boundary's pulse on a tick. Returns whether it started anything or opened a round. */
export async function pulseProject(row: ProjectAutomation, org: OrgAutomation, now: Date): Promise<boolean> {
  const eff = effectiveAutomation(org, choiceOf(row))
  if (!eff.enabled) return false
  const round = eff.throttle ? await openRoundIfDue(row, eff.batchSize, now) : null
  const started = await startFreeAgents(row.projectId, now)
  if (round) {
    await prisma.automationStart.update({ where: { id: round.id }, data: { started: withOutcomes(round.entries, started) as unknown as Json } })
    logger.info(`pulse round for project ${row.projectId}: ${round.entries.length} task(s) let through, ${started.length} started`)
    return true
  }
  if (started.length === 0) return false
  // A throttled boundary's round already records its batch; without the throttle each start is its own record.
  if (!eff.throttle) {
    await prisma.automationStart.create({ data: { projectId: row.projectId, kind: 'PULSE', started: started as unknown as Json } })
  }
  return true
}

/**
 * Opens a round if one is due (claimed by compare-and-set on the stored due
 * time): up to the batch size of each agent's throttled tasks join its line,
 * recorded as the round. Only what is throttled at this moment: tasks queued
 * during the round wait for the next. Null when no round is due, another tick
 * opened it, or nothing was left to let through.
 */
export async function openRoundIfDue(
  row: ProjectAutomation,
  batchSize: number,
  now: Date,
): Promise<{ id: string; entries: StartedEntry[] } | null> {
  const dueAt = row.pulseDueAt
  if (row.openRoundId || !dueAt || dueAt.getTime() > dueBy(now).getTime()) return null
  const { projectId } = row
  const throttled = await prisma.task.findMany({
    where: { projectId, ...THROTTLED, ...notBeforeItsTime(now) },
    include: { assignedAgent: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
  if (throttled.length === 0) return null

  const id = randomUUID()
  const { count } = await prisma.projectAutomation.updateMany({
    where: { projectId, openRoundId: null, pulseDueAt: dueAt },
    data: { openRoundId: id, pulseDueAt: null },
  })
  if (count === 0) return null

  const entries: StartedEntry[] = []
  for (const batch of selectBatches(throttled, batchSize).values()) {
    for (const task of batch) {
      const promoted = await prisma.task.updateMany({ where: { id: task.id, runState: 'RUN_THROTTLED' }, data: { runState: 'RUN_QUEUED' } })
      if (promoted.count === 1 && task.assignedAgent) {
        entries.push({ taskId: task.id, title: task.title, agentId: task.assignedAgent.id, agentHandle: task.assignedAgent.handle, outcome: 'queued' })
      }
    }
  }
  if (entries.length === 0) {
    // Every task was withdrawn or started by someone else meanwhile: no round — put the due time back.
    await prisma.projectAutomation.updateMany({ where: { projectId, openRoundId: id }, data: { openRoundId: null, pulseDueAt: dueAt } })
    return null
  }
  await prisma.automationStart.create({ data: { id, projectId, kind: 'PULSE', started: entries as unknown as Json } })
  await notifyProjectBoards(projectId)
  return { id, entries }
}

/** Starts the first task in the line of every agent free in the project, agents in parallel. */
export async function startFreeAgents(projectId: string, now: Date = new Date()): Promise<StartedEntry[]> {
  const [inLine, running] = await Promise.all([
    prisma.task.findMany({ where: { projectId, ...PULSE_STARTABLE, ...startableNow(now) }, select: { assignedAgentId: true }, distinct: ['assignedAgentId'] }),
    prisma.task.findMany({ where: { projectId, runState: 'RUN_ACTIVE' }, select: { assignedAgentId: true } }),
  ])
  const busy = new Set(running.map(t => t.assignedAgentId))
  const free = inLine.map(t => t.assignedAgentId).filter((id): id is string => !!id && !busy.has(id))
  if (free.length === 0) return []
  const agents = await prisma.agent.findMany({ where: { id: { in: free } } })
  const results = await Promise.all(agents.map(async (agent) => {
    const r = await taskRunner.startNext(agent, projectId, true)
    if (!r || r.outcome === 'skipped') return null
    const entry: StartedEntry = {
      taskId: r.id, title: r.title, agentId: agent.id, agentHandle: agent.handle, outcome: r.outcome,
      ...(r.reason ? { reason: r.reason } : {}),
    }
    return entry
  }))
  return results.filter((e): e is StartedEntry => e !== null)
}

/** A round's batch with how each start on this tick went; the rest stay queued, to run after the first. */
function withOutcomes(batch: StartedEntry[], started: StartedEntry[]): StartedEntry[] {
  const byTask = new Map(started.map(s => [s.taskId, s]))
  return batch.map(e => byTask.get(e.taskId) ?? e)
}

/** Closes every open round none of whose tasks is still queued or running, and stores when the next is due. */
export async function closeFinishedRounds(org: OrgAutomation, now: Date): Promise<number> {
  const open = await prisma.projectAutomation.findMany({ where: { openRoundId: { not: null } } })
  let closed = 0
  for (const row of open) {
    const record = await prisma.automationStart.findUnique({ where: { id: row.openRoundId! } })
    const taskIds = startedTaskIds(record?.started)
    const tasks = taskIds.length
      ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { runState: true } })
      : []
    if (!roundFinished(tasks.map(t => t.runState))) continue
    const eff = effectiveAutomation(org, choiceOf(row))
    const { count } = await prisma.projectAutomation.updateMany({
      where: { projectId: row.projectId, openRoundId: row.openRoundId },
      data: {
        openRoundId: null,
        lastRoundFinishedAt: now,
        pulseDueAt: pulseDueAt(now, eff.intervalMinutes, now),
      },
    })
    closed += count
    if (count > 0) await notifyProjectBoards(row.projectId)
  }
  return closed
}

export function startedTaskIds(started: unknown): string[] {
  if (!Array.isArray(started)) return []
  return started
    .map(e => (typeof e === 'object' && e !== null ? (e as Record<string, unknown>).taskId : null))
    .filter((id): id is string => typeof id === 'string')
}
