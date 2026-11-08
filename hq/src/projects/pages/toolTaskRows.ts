import { needsPerson, type ToolTask } from '@agenthix/ui/tasks'
import { NO_AGENT_REASON } from '../../agents/taskExecutionReasons'

type When = string | Date | null | undefined

/** A task as `getTasks`, `getMyTasks` and `getTask` return it, cast at the boundary. */
export interface TaskRowData {
  id: string
  number: number
  title: string
  /** Its task state (always sent by this hq). */
  state?: string
  priority: string
  runState: string
  runStateReason: string | null
  assignedAgentId: string | null
  assignedAgent: { id: string; name: string; handle: string | null } | null
  /** Its column, as its type names it (since client protocol 1.16). */
  typeColumn?: { name: string } | null
  scheduleNextDueAt?: When
  lastWorkedAt?: When
  updatedAt?: When
  doneAt?: When
  result: string | null
  createdAt: string | Date
  project?: { id: string; key: string; name: string } | null
}

const iso = (v: When): string | null => (v ? new Date(v).toISOString() : null)

/** Would run, but has no agent: queued with none, or a start time that fell due with none. */
export function waitsForAgent(row: Pick<TaskRowData, 'runState' | 'runStateReason' | 'assignedAgentId'>): boolean {
  if (row.assignedAgentId) return false
  return row.runState === 'RUN_QUEUED'
    || (row.runState === 'RUN_NONE' && row.runStateReason === NO_AGENT_REASON)
}

export function toToolTask(row: TaskRowData, project: { id: string; key: string; name: string }): ToolTask {
  const p = row.project ?? project
  return {
    id: row.id,
    key: `${p.key}-${row.number}`,
    title: row.title,
    priority: (row.priority as ToolTask['priority']),
    state: row.state ?? 'BACKLOG',
    runState: row.runState,
    runStateReason: row.runStateReason,
    agent: row.assignedAgent ? { id: row.assignedAgent.id, name: row.assignedAgent.name, handle: row.assignedAgent.handle ?? '' } : null,
    columnLabel: row.typeColumn?.name ?? null,
    project: { id: p.id, key: p.key, name: p.name },
    waitsForAgent: waitsForAgent(row),
    startsAt: iso(row.scheduleNextDueAt),
    workingSince: row.runState === 'RUN_ACTIVE' ? iso(row.lastWorkedAt ?? row.updatedAt) : null,
    doneAt: iso(row.doneAt),
    result: row.result,
    createdAt: iso(row.createdAt) ?? '',
  }
}

/** How many of these rows need the person: the navigation's count, from the same rule as the lists' group. */
export function needsYouCount(rows: Pick<TaskRowData, 'state' | 'runState' | 'runStateReason' | 'assignedAgentId'>[]): number {
  return rows.filter(r => needsPerson({ state: r.state, runState: r.runState, waitsForAgent: waitsForAgent(r) })).length
}
