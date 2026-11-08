/**
 * Why a queued task has not started (spec §6), worked out when it is read, so a
 * task that sits never looks like a fault: its place in its agent's line, in
 * the project's rank order (agentLineOrder.ts).
 * A running task whose site holds it for a free run slot says so too, naming
 * the site ("Runs are waiting: office-server is at capacity"). The browser
 * turns each into words (`runWaitText` in @agenthix/ui).
 */
import { prisma } from 'wasp/server'
import type { RunWaitNote } from '@agenthix/core'
import { IN_LINE } from '../agents/taskSlotClaim'
import { WAITING_FOR_BRANCH_REASON, WAITING_FOR_SLOT_REASON } from '../agents/taskExecutionReasons'
import { lineOrder } from '../agents/agentLineOrder'
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

type LineTask = { id: string; projectId: string; assignedAgentId: string | null; rank: string | null; number: number }

export { lineOrder }

const pairKey = (projectId: string, agentId: string | null) => `${projectId}:${agentId}`

function needsNote(t: NoteTask): boolean {
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
  const [inLine, running, sites] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: { in: projectIds }, ...IN_LINE, assignedAgentId: { not: null } },
      select: { id: true, projectId: true, assignedAgentId: true, rank: true, number: true },
    }),
    prisma.task.findMany({ where: { projectId: { in: projectIds }, runState: 'RUN_ACTIVE' }, select: { projectId: true, assignedAgentId: true } }),
    siteNames(slotProjects),
  ])
  const busy = new Set(running.map(t => pairKey(t.projectId, t.assignedAgentId)))
  const lines = new Map<string, LineTask[]>()
  for (const t of inLine) {
    const key = pairKey(t.projectId, t.assignedAgentId)
    lines.set(key, [...(lines.get(key) ?? []), t])
  }
  const position = new Map<string, number>()
  for (const line of lines.values()) line.sort(lineOrder).forEach((t, i) => position.set(t.id, i + 1))

  const noteFor = (t: T): RunWaitNote | null => {
    if (!needsNote(t)) return null
    if (t.runState === 'RUN_ACTIVE' && t.runStateReason === WAITING_FOR_BRANCH_REASON) return { kind: 'branch' }
    if (t.runState === 'RUN_ACTIVE') return { kind: 'slot', siteName: sites.get(t.projectId) ?? null }
    if (!t.assignedAgentId) return { kind: 'noAgent' }
    const place = position.get(t.id)
    if (place === undefined) return null
    return {
      kind: 'line',
      position: place,
      agentName: t.assignedAgent?.name ?? 'its agent',
      agentBusy: busy.has(pairKey(t.projectId, t.assignedAgentId)),
    }
  }
  return tasks.map(t => ({ ...t, runWait: noteFor(t) }))
}
