/**
 * Reads and writes a boundary's automation values and the pulse's stored due
 * time. Every change to what decides when a pulse is due — a project's choice,
 * the org's values, the end of a round, hq starting — recomputes the stored
 * `pulseDueAt` here and changes nothing else (adr-0088).
 */
import { prisma } from 'wasp/server'
import type { Prisma, ProjectAutomation } from '@prisma/client'
import {
  effectiveAutomation, orgAutomationFromRow,
  type EffectiveAutomation, type OrgAutomation, type ProjectAutomationChoice,
} from './automationSettings'
import { pulseDueAt } from './pulsePlan'
import { nudgeScheduler } from './schedulerNudge'
import { boardsOfTasksWhere, notifyBoards } from '../projects/boardNotify'

export async function loadOrgAutomation(): Promise<OrgAutomation> {
  return orgAutomationFromRow(await prisma.org.findFirst())
}

export function choiceOf(row: ProjectAutomation | null): ProjectAutomationChoice | null {
  if (!row) return null
  return {
    enabled: row.enabled,
    intervalMinutes: row.intervalMinutes,
    batchSize: row.batchSize,
    queueLimit: row.queueLimit,
    agentSchedules: row.agentSchedules,
    throttle: row.throttle,
    maxDepth: row.maxDepth,
  }
}

/** A project's effective automation — the stricter of the org's values and its own — read now. */
export async function effectiveForProject(projectId: string, org?: OrgAutomation): Promise<EffectiveAutomation> {
  const [o, row] = await Promise.all([
    org ? Promise.resolve(org) : loadOrgAutomation(),
    prisma.projectAutomation.findUnique({ where: { projectId } }),
  ])
  return effectiveAutomation(o, choiceOf(row))
}

/**
 * Stores a project's choice as made, and recomputes when its pulse is next due.
 * A round in progress keeps its open state; its end recomputes the due time.
 */
export async function saveProjectChoice(
  projectId: string,
  choice: ProjectAutomationChoice,
  userId: string,
  now: Date = new Date(),
): Promise<ProjectAutomation> {
  const org = await loadOrgAutomation()
  const existing = await prisma.projectAutomation.findUnique({ where: { projectId } })
  const eff = effectiveAutomation(org, choice)
  const due = existing?.openRoundId ? null : pulseDueAt(existing?.lastRoundFinishedAt ?? null, eff.intervalMinutes, now)
  const saved = await prisma.projectAutomation.upsert({
    where: { projectId },
    create: { projectId, ...choice, pulseDueAt: due, updatedById: userId },
    update: { ...choice, ...(existing?.openRoundId ? {} : { pulseDueAt: due }), updatedById: userId },
  })
  if (!eff.throttle) await releaseThrottled({ projectId })
  return saved
}

/**
 * With the throttle off, nothing is held for a round: the throttled tasks join
 * their agents' lines (adr-0091). Switching it on leaves queued tasks as they
 * are; they run as the batch already let through.
 */
export async function releaseThrottled(where: Prisma.TaskWhereInput): Promise<number> {
  const held: Prisma.TaskWhereInput = { ...where, runState: 'RUN_THROTTLED' }
  const boards = await boardsOfTasksWhere(held)
  const { count } = await prisma.task.updateMany({ where: held, data: { runState: 'RUN_QUEUED' } })
  if (count > 0) {
    await notifyBoards(boards)
    nudgeScheduler()
  }
  return count
}

/** After the org's values change: every project whose throttle is now off releases its throttled tasks. */
export async function releaseThrottledWhereOff(org: OrgAutomation): Promise<number> {
  if (org.throttle) return 0
  return releaseThrottled({ project: { OR: [{ automation: null }, { automation: { throttle: false } }] } })
}

/**
 * Recomputes every pulse's due time from what is stored — at boot, and after
 * the org changes a value. A round still open is left to finish; one whose
 * project never had a round is due now, so queued work starts on the leading
 * edge.
 */
export async function recomputePulseDueTimes(now: Date = new Date()): Promise<number> {
  const org = await loadOrgAutomation()
  const rows = await prisma.projectAutomation.findMany({ where: { openRoundId: null } })
  let changed = 0
  for (const row of rows) {
    const eff = effectiveAutomation(org, choiceOf(row))
    const due = pulseDueAt(row.lastRoundFinishedAt, eff.intervalMinutes, now)
    if (row.pulseDueAt?.getTime() === due.getTime()) continue
    const { count } = await prisma.projectAutomation.updateMany({
      where: { projectId: row.projectId, openRoundId: null },
      data: { pulseDueAt: due },
    })
    changed += count
  }
  return changed
}

/** How many queued tasks agents hold in a project — queued or throttled, last queued by an agent; what the queue limit counts. */
export function agentQueuedCount(projectId: string): Promise<number> {
  return prisma.task.count({
    where: { projectId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, queuedByAgentId: { not: null } },
  })
}
