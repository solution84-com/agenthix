/**
 * The Runs history's Waiting tab holds the tasks in their agent's line, as the Workroom counts them (the Workroom
 * design, *Why a run waits*): each with its one reason, the same words as under the task in a card's In line. A task in
 * line has no run yet (or one its site holds), so its row is the task's next run. Pure: `historyLine.ts` reads.
 */
import { lineWhy, waitsOnItsSite, type LineTask } from '../projects/workroom/workroomRules'
import type { RunWhose } from './historyRules'
import type { RunHistoryRow } from './historyTypes'

export type LineTaskRow = LineTask & {
  projectId: string
  number: number
  runCount: number
  updatedAt: Date
  runStartedBy: string | null
  queuedByUserId: string | null
  queuedByAgentId: string | null
  onBehalfOfUserId: string
  runOnBehalfOfUserId: string | null
  project: { key: string; name: string }
  assignedAgent: { id: string; name: string; avatarUrl: string | null } | null
}

export type LineRow = RunHistoryRow & { whose: RunWhose }

/** An in-line task's row id: no run of it exists yet, so it is named after the task. */
export const lineRowId = (taskId: string) => `line:${taskId}`

function inLine(t: LineTaskRow, now: Date): boolean {
  return t.runState === 'RUN_QUEUED' || waitsOnItsSite(t)
    || (t.runState === 'RUN_NONE' && !!t.scheduleNextDueAt && t.scheduleNextDueAt.getTime() > now.getTime())
}

function starter(t: LineTaskRow): RunWhose['starter'] {
  return t.runStartedBy === 'person' || t.runStartedBy === 'agent' || t.runStartedBy === 'schedule' ? t.runStartedBy : 'unknown'
}

function startedBy(t: LineTaskRow, me: string, names: { users: Map<string, string>; agents: Map<string, string> }): string {
  switch (t.runStartedBy) {
    case 'person': return !t.queuedByUserId ? 'someone' : t.queuedByUserId === me ? 'you' : names.users.get(t.queuedByUserId) ?? 'someone'
    case 'agent': return (t.queuedByAgentId && names.agents.get(t.queuedByAgentId)) || 'an agent'
    case 'schedule': return 'at its start time'
    default: return '—'
  }
}

/**
 * The rows of the tasks in line, each agent's line in rank order (`tasks` in LINE_ORDER, at work and in line alike, so
 * "next, after <the run at work>" can be said), with why each waits.
 */
export function lineRows(tasks: LineTaskRow[], siteNames: Map<string, string | null>, me: string, names: { users: Map<string, string>; agents: Map<string, string> }, now: Date): LineRow[] {
  const lines = new Map<string, LineTaskRow[]>()
  for (const t of tasks) {
    if (!t.assignedAgent) continue
    const k = `${t.projectId}:${t.assignedAgent.id}`
    lines.set(k, [...(lines.get(k) ?? []), t])
  }
  const rows: LineRow[] = []
  for (const agentTasks of lines.values()) {
    const atWork = agentTasks.find(t => t.runState === 'RUN_ACTIVE' && !waitsOnItsSite(t))
    const line = agentTasks.filter(t => inLine(t, now))
    line.forEach((t, i) => {
      const key = `${t.project.key}-${t.number}`
      rows.push({
        runId: lineRowId(t.id), sessionId: '', kind: 'task', taskKey: key, taskId: t.id,
        // A run its site holds has started, so it has its number; otherwise this is the task's next run.
        number: t.runState === 'RUN_ACTIVE' ? t.runCount || null : t.runCount + 1,
        title: t.title, href: `/tasks/${key}`, openable: false,
        place: { name: t.project.name, projectKey: t.project.key }, agent: t.assignedAgent,
        group: 'waiting', ring: 'WAITING', note: { tone: 'muted', lead: 'Waiting', text: null },
        why: lineWhy(line, i, atWork?.title ?? null, siteNames.get(t.projectId) ?? null, now),
        tookMs: null, cost: null, startedBy: startedBy(t, me, names), at: t.updatedAt.toISOString(),
        whose: { starter: starter(t), personId: t.runOnBehalfOfUserId ?? t.queuedByUserId ?? t.onBehalfOfUserId },
      })
    })
  }
  return rows
}
