/**
 * A task, and a comment on one, as the client protocol declares them (`@agenthix/core/client`): built field by
 * field from hq's rows, so a column added to the database reaches no client until it is declared there.
 * `applicationData` stays in hq: the workforce review reads it through its own operation.
 */
import type { Task, TaskComment } from 'wasp/entities'
import type {
  AgentRef, ProjectTaskListItem, RunWaitNote, TaskBoardRef, TaskCommentView, TaskFields, TaskProjectRef,
} from '@agenthix/core'
import { wireColumns } from './boardColumns'

/** Stored as JSON; anything but a list of words reads as none. */
export function labelsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
}

export function taskFields(t: Task): TaskFields {
  return {
    id: t.id, title: t.title, description: t.description, projectId: t.projectId, number: t.number,
    boardId: t.boardId, column: t.column, sprintId: t.sprintId, status: t.status,
    assignedAgentId: t.assignedAgentId, priority: t.priority, labels: labelsOf(t.labels), archived: t.archived,
    doneAt: t.doneAt, runState: t.runState, runStateReason: t.runStateReason, runId: t.runId, result: t.result,
    deferCount: t.deferCount, lastWorkedAt: t.lastWorkedAt, runStartedBy: t.runStartedBy,
    runOnBehalfOfUserId: t.runOnBehalfOfUserId, queueDepth: t.queueDepth, onBehalfOfUserId: t.onBehalfOfUserId,
    queuedByUserId: t.queuedByUserId, queuedByAgentId: t.queuedByAgentId, queuedBySessionId: t.queuedBySessionId,
    queuedByConnectionId: t.queuedByConnectionId, createdByConnectionId: t.createdByConnectionId,
    scheduleAt: t.scheduleAt, scheduleNextDueAt: t.scheduleNextDueAt, scheduleSetByUserId: t.scheduleSetByUserId,
    scheduleSetByAgentId: t.scheduleSetByAgentId, scheduleSetBySessionId: t.scheduleSetBySessionId,
    scheduleSetByConnectionId: t.scheduleSetByConnectionId, routineId: t.routineId, roundAt: t.roundAt,
    planStart: t.planStart, planFinish: t.planFinish, isEpic: t.isEpic, epicId: t.epicId,
    milestoneId: t.milestoneId, createdAt: t.createdAt, updatedAt: t.updatedAt,
  }
}

export function agentRef(a: AgentRef | null): AgentRef | null {
  return a ? { id: a.id, name: a.name, handle: a.handle } : null
}

export function taskBoardRef(b: { id: string; name: string; kind: TaskBoardRef['kind']; columns: unknown }): TaskBoardRef {
  return { id: b.id, name: b.name, kind: b.kind, columns: wireColumns(b.columns) }
}

export function taskProjectRef(p: TaskProjectRef): TaskProjectRef {
  return { id: p.id, name: p.name, key: p.key }
}

/** The include every task list reads with: its agent and its board with the columns. */
export const LISTED_TASK_INCLUDE = {
  assignedAgent: { select: { id: true, name: true, handle: true } },
  board: { select: { id: true, name: true, kind: true, columns: true } },
} as const

type ListedRow = Task & {
  assignedAgent: AgentRef | null
  board: { id: string; name: string; kind: TaskBoardRef['kind']; columns: unknown }
  runWait: RunWaitNote | null
}

export function projectTaskListItem(t: ListedRow): ProjectTaskListItem {
  return { ...taskFields(t), assignedAgent: agentRef(t.assignedAgent), board: taskBoardRef(t.board), runWait: t.runWait }
}

export function taskCommentView(c: TaskComment & { agent: AgentRef | null }): TaskCommentView {
  return {
    id: c.id, taskId: c.taskId, authorType: c.authorType, agentId: c.agentId, userId: c.userId,
    connectionId: c.connectionId, runId: c.runId, content: c.content, createdAt: c.createdAt,
    agent: agentRef(c.agent),
  }
}
