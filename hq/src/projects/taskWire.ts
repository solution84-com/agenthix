/**
 * A task, and a comment on one, as the client protocol declares them (`@agenthix/core/client`): built field by
 * field from hq's rows, so a column added to the database reaches no client until it is declared there.
 * `applicationData` stays in hq: the workforce review reads it through its own operation.
 */
import type { Task, TaskComment } from 'wasp/entities'
import type {
  AgentRef, BoardTaskStatus, ProjectTaskListItem, RunWaitNote, TaskBoardRef, TaskCommentView, TaskFields, TaskProjectRef,
  TaskState, TaskTypeKind, TaskTypeRef,
} from '@agenthix/core'
import { isBoardColour } from '@agenthix/core'
import { columnOfState } from './deprecatedBoardPlace'

/** Stored as JSON; anything but a list of words reads as none. */
export function labelsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
}

/** What a task row is read with for its wire fields: its type's kind, which says whether it is an epic. */
export const TASK_KIND_INCLUDE = { type: { select: { kind: true } } } as const

/** A task row with its type's kind; a task with no type yet is a task, never an epic. */
export type TaskWithKind = Task & { type: { kind: TaskTypeKind } | null }

export const isEpicTask = (t: { type: { kind: TaskTypeKind } | null }): boolean => t.type?.kind === 'EPIC'

/** The deprecated board status a task state stands for: Backlog was To do in the board's Backlog. */
export const statusOfState = (state: TaskState): BoardTaskStatus => (state === 'BACKLOG' ? 'TODO' : state)

/** The task states a deprecated status filter stands for: To do was Backlog as well. Anything else matches none. */
export function stateWhereOfStatus(status: string): { in: TaskState[] } {
  if (status === 'TODO') return { in: ['BACKLOG', 'TODO'] }
  if (status === 'IN_PROGRESS' || status === 'DONE') return { in: [status] }
  return { in: [] }
}

/** `result` is the task's latest run's (runResults.ts `withLatestResults`); a row read without it has none. */
export function taskFields(t: TaskWithKind & { result?: string | null }): TaskFields {
  return {
    id: t.id, title: t.title, description: t.description, projectId: t.projectId, number: t.number,
    // A task is on no board (adr-0176): the deprecated place is worked out (deprecatedBoardPlace.ts).
    boardId: t.projectId, column: columnOfState(t.state), sprintId: t.sprintId, modelChoice: t.modelChoice, status: statusOfState(t.state),
    assignedAgentId: t.assignedAgentId, priority: t.priority, labels: labelsOf(t.labels), archived: t.archived,
    doneAt: t.doneAt, runState: t.runState, runStateReason: t.runStateReason, runId: t.runId, result: t.result ?? null,
    deferCount: t.deferCount, lastWorkedAt: t.lastWorkedAt, runStartedBy: t.runStartedBy,
    runOnBehalfOfUserId: t.runOnBehalfOfUserId, queueDepth: t.queueDepth, onBehalfOfUserId: t.onBehalfOfUserId,
    queuedByUserId: t.queuedByUserId, queuedByAgentId: t.queuedByAgentId, queuedBySessionId: t.queuedBySessionId,
    queuedByConnectionId: t.queuedByConnectionId, createdByConnectionId: t.createdByConnectionId,
    scheduleAt: t.scheduleAt, scheduleNextDueAt: t.scheduleNextDueAt, scheduleSetByUserId: t.scheduleSetByUserId,
    scheduleSetByAgentId: t.scheduleSetByAgentId, scheduleSetBySessionId: t.scheduleSetBySessionId,
    scheduleSetByConnectionId: t.scheduleSetByConnectionId,
    // Deprecated wire fields (a routine makes no task, adr-0177): always null.
    routineId: null, roundAt: null,
    planStart: t.planStart, planFinish: t.planFinish, isEpic: isEpicTask(t), epicId: t.epicId,
    milestoneId: t.milestoneId, createdAt: t.createdAt, updatedAt: t.updatedAt,
    // The task model's (since 1.16): its type, column and rank only once it has them.
    ...(t.typeId ? { typeId: t.typeId } : {}), ...(t.columnId ? { columnId: t.columnId } : {}),
    ...(t.rank ? { rank: t.rank } : {}), state: t.state, executionState: t.executionState,
  }
}

export function agentRef(a: AgentRef | null): AgentRef | null {
  return a ? { id: a.id, name: a.name, handle: a.handle } : null
}

/** The deprecated board a listed task is on: its project's built-in Task state board, with no columns of its own. */
export function taskBoardRef(projectId: string): TaskBoardRef {
  return { id: projectId, name: 'Task state', kind: 'PROJECT_TASKS', columns: [] }
}

/** What a task's text needs of its project beyond who it is: whether it is its person's Your space, and whose. */
export type TaskProjectFacts = TaskProjectRef & { personalSpace: boolean; personalOwnerId: string | null }

export function taskProjectFacts(p: TaskProjectFacts): TaskProjectFacts {
  return { ...taskProjectRef(p), personalSpace: p.personalSpace, personalOwnerId: p.personalOwnerId }
}

export function taskProjectRef(p: TaskProjectRef): TaskProjectRef {
  return { id: p.id, name: p.name, key: p.key }
}

/** The include every task list reads with: its agent, its type and its column. */
export const LISTED_TASK_INCLUDE = {
  assignedAgent: { select: { id: true, name: true, handle: true } },
  typeColumn: { select: { id: true, name: true, colour: true, state: true } },
  type: { select: { id: true, name: true, icon: true, kind: true } },
} as const

type ListedRow = Omit<Task, 'type'> & {
  type: TaskTypeRef | null
  result?: string | null
  assignedAgent: AgentRef | null
  typeColumn?: { id: string; name: string; colour: string; state: TaskState } | null
  runWait: RunWaitNote | null
}

export function projectTaskListItem(t: ListedRow): ProjectTaskListItem {
  return {
    ...taskFields(t), assignedAgent: agentRef(t.assignedAgent), board: taskBoardRef(t.projectId), runWait: t.runWait,
    ...(t.type ? { type: { id: t.type.id, name: t.type.name, icon: t.type.icon, kind: t.type.kind } } : {}),
    ...(t.typeColumn ? { typeColumn: { ...t.typeColumn, colour: isBoardColour(t.typeColumn.colour) ? t.typeColumn.colour : 'neutral' } } : {}),
  }
}

export function taskCommentView(c: TaskComment & { agent: AgentRef | null }): TaskCommentView {
  return {
    id: c.id, taskId: c.taskId, authorType: c.authorType, agentId: c.agentId, userId: c.userId,
    connectionId: c.connectionId, runId: c.runId, content: c.content, parentId: c.parentId, savedFromConversation: c.savedFromConversation, createdAt: c.createdAt,
    agent: agentRef(c.agent),
  }
}
