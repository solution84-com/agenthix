/**
 * What an agent is doing, as the Agents design shows it (every screen reviewed
 * spec §3): **Now** — the tasks of its that need a person, then the ones
 * running — and **Coming up** — the start times set on its tasks and its
 * routines' rounds. One project's tasks give the Agents tool's view; every
 * project the person can see gives the agent's place and its card.
 *
 * Pure: the rows come from `agentWork.ts`. "Needs you" is the one server rule
 * (`projects/needsYou.ts`), so this agrees with the Tasks tool.
 */
import { needsYou, type NeedsYouFields } from '../projects/needsYou'

export type WorkTask = {
  id: string
  number: number
  title: string
  projectId: string
  projectKey: string
  projectName: string
  status: string
  runState: string
  runStateReason: string | null
  assignedAgentId: string | null
  scheduleNextDueAt: Date | null
  lastWorkedAt: Date | null
  updatedAt: Date
}

export type WorkRoutine = {
  id: string
  title: string
  projectId: string
  projectName: string
  enabled: boolean
  nextRoundAt: Date | null
  assignedAgentId?: string | null
}

export type NowItem = {
  kind: 'needsYou' | 'running'
  taskId: string
  key: string
  title: string
  projectId: string
  projectName: string
  /** Why it needs a person, as stored on the task; null when running. */
  reason: string | null
  /** When a running task started working; null when it needs a person. */
  since: string | null
}

export type ComingUpItem =
  | { kind: 'task'; at: string; taskId: string; key: string; title: string; projectId: string; projectName: string }
  | { kind: 'routine'; at: string; routineId: string; title: string; projectId: string; projectName: string }

export type AgentNow = {
  state: 'needsYou' | 'running' | 'idle'
  /** The item the state is about: the first that needs a person, else the first running. */
  lead: NowItem | null
  needsYouCount: number
  runningCount: number
  /** What starts next, when anything is set to. */
  next: ComingUpItem | null
}

export type TaskStateCounts = { todo: number; inProgress: number; done: number; needsYou: number; running: number; total: number }

export const COMING_UP_LIMIT = 10

const keyOf = (t: WorkTask) => `${t.projectKey}-${t.number}`

export function nowItems(tasks: WorkTask[]): NowItem[] {
  const base = (t: WorkTask) => ({ taskId: t.id, key: keyOf(t), title: t.title, projectId: t.projectId, projectName: t.projectName })
  const waiting = tasks.filter(needsYou).map((t): NowItem => ({ kind: 'needsYou', ...base(t), reason: t.runStateReason, since: null }))
  const running = tasks
    .filter(t => t.runState === 'RUN_ACTIVE' && !needsYou(t))
    .map((t): NowItem => ({ kind: 'running', ...base(t), reason: null, since: (t.lastWorkedAt ?? t.updatedAt).toISOString() }))
  return [...waiting, ...running]
}

export function comingUp(tasks: WorkTask[], routines: WorkRoutine[], now: Date, limit = COMING_UP_LIMIT): ComingUpItem[] {
  const ahead = (d: Date | null): d is Date => !!d && d.getTime() >= now.getTime()
  const items: ComingUpItem[] = [
    ...tasks.filter(t => ahead(t.scheduleNextDueAt)).map((t): ComingUpItem => ({
      kind: 'task', at: t.scheduleNextDueAt!.toISOString(), taskId: t.id, key: keyOf(t), title: t.title,
      projectId: t.projectId, projectName: t.projectName,
    })),
    ...routines.filter(r => r.enabled && ahead(r.nextRoundAt)).map((r): ComingUpItem => ({
      kind: 'routine', at: r.nextRoundAt!.toISOString(), routineId: r.id, title: r.title,
      projectId: r.projectId, projectName: r.projectName,
    })),
  ]
  items.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title))
  return items.slice(0, limit)
}

export function summariseNow(tasks: WorkTask[], routines: WorkRoutine[], now: Date): AgentNow {
  const items = nowItems(tasks)
  const needsYouCount = items.filter(i => i.kind === 'needsYou').length
  const runningCount = items.length - needsYouCount
  return {
    state: needsYouCount > 0 ? 'needsYou' : runningCount > 0 ? 'running' : 'idle',
    lead: items[0] ?? null,
    needsYouCount,
    runningCount,
    next: comingUp(tasks, routines, now, 1)[0] ?? null,
  }
}

export function countByState(tasks: NeedsYouFields[]): TaskStateCounts {
  const counts: TaskStateCounts = { todo: 0, inProgress: 0, done: 0, needsYou: 0, running: 0, total: tasks.length }
  for (const t of tasks) {
    if (t.status === 'DONE') counts.done++
    else if (t.status === 'IN_PROGRESS') counts.inProgress++
    else counts.todo++
    if (needsYou(t)) counts.needsYou++
    else if (t.runState === 'RUN_ACTIVE') counts.running++
  }
  return counts
}
