/**
 * What the Automation tool lists beside its status (every screen reviewed spec
 * §3): **Later**, what will start in time order — each routine's next run and
 * the start times set on tasks — and the stuck items **Now** names with a fix.
 * Pure: the rows come from automationOutlook.ts.
 */

export type LaterItem =
  | { kind: 'routine'; at: string; routineId: string; title: string }
  | { kind: 'task'; at: string; taskId: string; key: string; title: string }

export type StuckItem =
  /** Queued, or due at its start time, with no agent to run it. */
  | { kind: 'noAgent'; taskId: string; key: string; title: string }
  /** Blocked because the person it is done for can no longer reach the project. */
  | { kind: 'lostAccess'; taskId: string; key: string; title: string }
  /** A routine the system paused, with why. */
  | { kind: 'routinePaused'; routineId: string; title: string; reason: string }

type LaterRoutine = { id: string; title: string; nextRoundAt: Date | null; enabled: boolean }
type LaterTask = { id: string; number: number; title: string; scheduleNextDueAt: Date | null }

export const LATER_LIMIT = 10

export function laterInOrder(args: {
  projectKey: string
  routines: LaterRoutine[]
  tasks: LaterTask[]
  now: Date
  limit?: number
}): { items: LaterItem[]; more: number } {
  const { projectKey, now, limit = LATER_LIMIT } = args
  const ahead = (d: Date | null): d is Date => !!d && d.getTime() >= now.getTime()
  const all: LaterItem[] = [
    ...args.routines
      .filter(r => r.enabled && ahead(r.nextRoundAt))
      .map(r => ({ kind: 'routine' as const, at: r.nextRoundAt!.toISOString(), routineId: r.id, title: r.title })),
    ...args.tasks
      .filter(t => ahead(t.scheduleNextDueAt))
      .map(t => ({ kind: 'task' as const, at: t.scheduleNextDueAt!.toISOString(), taskId: t.id, key: `${projectKey}-${t.number}`, title: t.title })),
  ]
  all.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title))
  return { items: all.slice(0, limit), more: Math.max(0, all.length - limit) }
}

type StuckTask = {
  id: string
  number: number
  title: string
  runState: string
  runStateReason: string | null
  assignedAgentId: string | null
}

export function stuckOf(args: {
  projectKey: string
  tasks: StuckTask[]
  routines: Array<{ id: string; title: string; pausedReason: string | null }>
  /** The stored reasons that mark a task stuck (taskExecutionReasons.ts), passed in to keep this pure. */
  reasons: { lostAccess: string; noAgent: string }
}): StuckItem[] {
  const { projectKey, reasons } = args
  const items: StuckItem[] = []
  for (const t of args.tasks) {
    const ref = { taskId: t.id, key: `${projectKey}-${t.number}`, title: t.title }
    if (!t.assignedAgentId && (t.runState === 'RUN_QUEUED' || t.runStateReason === reasons.noAgent)) {
      items.push({ kind: 'noAgent', ...ref })
    } else if (t.runState === 'RUN_BLOCKED' && t.runStateReason === reasons.lostAccess) {
      items.push({ kind: 'lostAccess', ...ref })
    }
  }
  for (const r of args.routines) {
    if (r.pausedReason) items.push({ kind: 'routinePaused', routineId: r.id, title: r.title, reason: r.pausedReason })
  }
  return items
}
