/**
 * Why a queued or throttled task has not started (spec §6), worked out when it
 * is read, so a task that sits never looks like a fault: its place in its
 * agent's line, the next round's time, or its boundary's automation being off.
 * A running task whose site holds it for a free run slot says so too, naming
 * the site ("Runs are waiting: office-server is at capacity"). The browser
 * turns each into words (`runWaitText` in @agenthix/ui).
 */
import { prisma } from 'wasp/server'
import type { RunWaitNote } from '@agenthix/core'
import { IN_LINE } from '../agents/taskSlotClaim'
import { WAITING_FOR_BRANCH_REASON, WAITING_FOR_SLOT_REASON } from '../agents/taskExecutionReasons'
import { effectiveAutomation } from './automationSettings'
import { choiceOf, loadOrgAutomation } from './automationStore'
import { displaySiteName } from '../shared/siteName'

type SiteRow = { label: string; isDefault: boolean } | null

/** The site each project runs on, by name: its own, or for a personal project its person's. */
async function siteNames(projectIds: string[]): Promise<Map<string, string | null>> {
  if (projectIds.length === 0) return new Map()
  const site = { select: { label: true, isDefault: true } } as const
  const rows = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, executionSite: site, personalOwner: { select: { storagePlacement: { select: { site } } } } },
  })
  return new Map(rows.map(r => {
    const s: SiteRow = r.executionSite ?? r.personalOwner?.storagePlacement?.site ?? null
    return [r.id, s ? displaySiteName(s) : null]
  }))
}

/** Declared in core's client protocol, since the mobile app reads it too. */
export type { RunWaitNote } from '@agenthix/core'

type NoteTask = {
  id: string
  projectId: string
  runState: string
  runStateReason: string | null
  assignedAgentId: string | null
  assignedAgent?: { name: string } | null
}

type LineTask = { id: string; projectId: string; assignedAgentId: string | null; runStartedBy: string | null; priority: string; createdAt: Date }

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** An agent's line: starts someone asked for first, then the rest, each by priority then age (taskSlotClaim.ts). */
export function lineOrder(a: LineTask, b: LineTask): number {
  const asked = (t: LineTask) => (t.runStartedBy ? 0 : 1)
  return asked(a) - asked(b)
    || (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    || a.createdAt.getTime() - b.createdAt.getTime()
}

const pairKey = (projectId: string, agentId: string | null) => `${projectId}:${agentId}`

function needsNote(t: NoteTask): boolean {
  if (t.runState === 'RUN_THROTTLED') return true
  if (t.runState === 'RUN_ACTIVE') return t.runStateReason === WAITING_FOR_SLOT_REASON || t.runStateReason === WAITING_FOR_BRANCH_REASON
  // A reason already given (held, no agent...) is shown as it is.
  return t.runState === 'RUN_QUEUED' && (!!t.assignedAgentId || !t.runStateReason)
}

/** Each task with `runWait` — why it has not started — or null when there is nothing to say. */
export async function withRunWaitNotes<T extends NoteTask>(tasks: T[]): Promise<Array<T & { runWait: RunWaitNote | null }>> {
  const noted = tasks.filter(needsNote)
  if (noted.length === 0) return tasks.map(t => ({ ...t, runWait: null }))
  const projectIds = [...new Set(noted.map(t => t.projectId))]

  const slotProjects = [...new Set(noted.filter(t => t.runState === 'RUN_ACTIVE').map(t => t.projectId))]
  const [org, rows, inLine, running, sites] = await Promise.all([
    loadOrgAutomation(),
    prisma.projectAutomation.findMany({ where: { projectId: { in: projectIds } } }),
    prisma.task.findMany({
      where: { projectId: { in: projectIds }, ...IN_LINE, assignedAgentId: { not: null } },
      select: { id: true, projectId: true, assignedAgentId: true, runStartedBy: true, priority: true, createdAt: true },
    }),
    prisma.task.findMany({ where: { projectId: { in: projectIds }, runState: 'RUN_ACTIVE' }, select: { projectId: true, assignedAgentId: true } }),
    siteNames(slotProjects),
  ])
  const rowOf = new Map(rows.map(r => [r.projectId, r]))
  const busy = new Set(running.map(t => pairKey(t.projectId, t.assignedAgentId)))
  const lines = new Map<string, LineTask[]>()
  for (const t of inLine) {
    const key = pairKey(t.projectId, t.assignedAgentId)
    lines.set(key, [...(lines.get(key) ?? []), t])
  }
  const position = new Map<string, number>()
  for (const line of lines.values()) line.sort(lineOrder).forEach((t, i) => position.set(t.id, i + 1))
  const asked = new Set(inLine.filter(t => t.runStartedBy).map(t => t.id))

  const noteFor = (t: T): RunWaitNote | null => {
    if (!needsNote(t)) return null
    if (t.runState === 'RUN_ACTIVE' && t.runStateReason === WAITING_FOR_BRANCH_REASON) return { kind: 'branch' }
    if (t.runState === 'RUN_ACTIVE') return { kind: 'slot', siteName: sites.get(t.projectId) ?? null }
    if (!t.assignedAgentId) return { kind: 'noAgent' }
    const row = rowOf.get(t.projectId) ?? null
    const eff = effectiveAutomation(org, choiceOf(row))
    if (t.runState === 'RUN_THROTTLED') {
      if (!eff.enabled) return { kind: 'automationOff' }
      return { kind: 'round', roundOpen: !!row?.openRoundId, nextAt: row?.pulseDueAt?.toISOString() ?? null }
    }
    const place = position.get(t.id)
    if (place === undefined) return null
    if (!eff.enabled && !asked.has(t.id)) return { kind: 'automationOff' }
    return {
      kind: 'line',
      position: place,
      agentName: t.assignedAgent?.name ?? 'its agent',
      agentBusy: busy.has(pairKey(t.projectId, t.assignedAgentId)),
    }
  }
  return tasks.map(t => ({ ...t, runWait: noteFor(t) }))
}
