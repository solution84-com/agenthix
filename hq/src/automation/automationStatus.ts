/**
 * What a project's automation section shows (spec §2's sketch): its own
 * choices beside the org's values and the effective result, the last pulse
 * and what it started, when the next one is due, and how much is queued.
 */
import { prisma } from 'wasp/server'
import { effectiveAutomation, type EffectiveAutomation, type OrgAutomation, type ProjectAutomationChoice } from './automationSettings'
import { agentQueuedCount, choiceOf, loadOrgAutomation } from './automationStore'
import { PULSE_STARTABLE, THROTTLED, startedTaskIds, type StartedEntry } from './pulse'

export type AutomationRecordView = {
  id: string
  kind: 'PULSE' | 'SCHEDULE'
  firedAt: string
  taskId: string | null
  started: StartedEntry[]
}

export type ProjectAutomationStatus = {
  org: OrgAutomation
  choice: ProjectAutomationChoice | null
  effective: EffectiveAutomation
  roundOpen: boolean
  lastRoundFinishedAt: string | null
  /** When the pulse may next fire; null while a round is open or automation is off. */
  nextPulseAt: string | null
  queued: number
  /** Held for the next round; only with the throttle on. */
  throttled: number
  agentHeld: number
  recent: AutomationRecordView[]
}

/** One agent's part of a throttled boundary's open round: how many of its batch are no longer queued or running. */
export type RoundAgentProgress = { agentHandle: string; agentName: string; done: number; total: number }

/**
 * What a throttled boundary's board shows above its columns (spec §6): the
 * round in progress, or when the next may start. Null where the throttle is off.
 */
export type RoundLine = {
  automationOn: boolean
  open: boolean
  agents: RoundAgentProgress[]
  /** When the next round may start; null while one is open, or nothing is due. */
  nextAt: string | null
  throttled: number
}

const RECENT_RECORDS = 10

export async function projectAutomationStatus(projectId: string): Promise<ProjectAutomationStatus> {
  const [org, row, queued, throttled, agentHeld, records] = await Promise.all([
    loadOrgAutomation(),
    prisma.projectAutomation.findUnique({ where: { projectId } }),
    prisma.task.count({ where: { projectId, ...PULSE_STARTABLE } }),
    prisma.task.count({ where: { projectId, ...THROTTLED } }),
    agentQueuedCount(projectId),
    prisma.automationStart.findMany({ where: { projectId }, orderBy: { firedAt: 'desc' }, take: RECENT_RECORDS }),
  ])
  const choice = choiceOf(row)
  const effective = effectiveAutomation(org, choice)
  return {
    org,
    choice,
    effective,
    roundOpen: !!row?.openRoundId,
    lastRoundFinishedAt: row?.lastRoundFinishedAt?.toISOString() ?? null,
    nextPulseAt: effective.enabled && row?.pulseDueAt ? row.pulseDueAt.toISOString() : null,
    queued,
    throttled,
    agentHeld,
    recent: records.map(r => ({
      id: r.id,
      kind: r.kind === 'SCHEDULE' ? 'SCHEDULE' : 'PULSE',
      firedAt: r.firedAt.toISOString(),
      taskId: r.taskId,
      started: Array.isArray(r.started) ? (r.started as unknown as StartedEntry[]) : [],
    })),
  }
}

/** The round line for a project's board, or null where its throttle is off. */
export async function projectRoundLine(projectId: string): Promise<RoundLine | null> {
  const [org, row] = await Promise.all([loadOrgAutomation(), prisma.projectAutomation.findUnique({ where: { projectId } })])
  const effective = effectiveAutomation(org, choiceOf(row))
  if (!effective.throttle) return null
  const throttled = await prisma.task.count({ where: { projectId, ...THROTTLED } })
  const base = { automationOn: effective.enabled, throttled }
  if (!row?.openRoundId) {
    return { ...base, open: false, agents: [], nextAt: effective.enabled && row?.pulseDueAt ? row.pulseDueAt.toISOString() : null }
  }
  const record = await prisma.automationStart.findUnique({ where: { id: row.openRoundId } })
  const entries = Array.isArray(record?.started) ? (record.started as unknown as StartedEntry[]) : []
  const states = await prisma.task.findMany({ where: { id: { in: startedTaskIds(entries) } }, select: { id: true, runState: true } })
  const pending = new Set(states.filter(s => s.runState === 'RUN_QUEUED' || s.runState === 'RUN_ACTIVE').map(s => s.id))
  const agents = await prisma.agent.findMany({ where: { id: { in: [...new Set(entries.map(e => e.agentId))] } }, select: { id: true, name: true } })
  const names = new Map(agents.map(a => [a.id, a.name]))
  const byAgent = new Map<string, RoundAgentProgress>()
  for (const e of entries) {
    const p = byAgent.get(e.agentId) ?? { agentHandle: e.agentHandle, agentName: names.get(e.agentId) ?? e.agentHandle, done: 0, total: 0 }
    p.total++
    if (!pending.has(e.taskId)) p.done++
    byAgent.set(e.agentId, p)
  }
  return { ...base, open: true, agents: [...byAgent.values()], nextAt: null }
}
