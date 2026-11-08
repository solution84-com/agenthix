/**
 * A task's activity: one row per thing that happened to it, with who did it and when (the task page's Activity).
 * Recorded where each thing happens: the task services for edits, moves, assignment, comments and archiving, the
 * run paths for a run's start and end, and the request answers for approvals. Who is a person, an agent, or null
 * when HQ itself did it (the finished-task sweep, a run's limit).
 *
 * A record that cannot be written is logged, never thrown: what happened has happened, and the record must not
 * undo it. A run's rows are one of each kind per run (the `[runId, kind]` key), so a repeat is skipped.
 */
import { prisma } from 'wasp/server'
import type { Prisma, TaskActivityKind } from '@prisma/client'
import { Logger } from '../server/utils/logger'

const logger = new Logger('TaskActivity')

export type TaskActor = { kind: 'person'; userId: string } | { kind: 'agent'; agentId: string } | null

/** What changed, by kind. Ids, never names: a name is read when the activity is shown. */
export type TaskActivityDetail =
  | { fields: string[] }
  | { from: { boardId: string; column: string | null }; to: { boardId: string; column: string | null } }
  | { fromColumnId: string | null; toColumnId: string | null }
  | { fromAgentId: string | null; toAgentId: string | null }
  | { number: number | null; startedBy?: string; reason?: string | null }
  | { commentId: string; parentId: string | null }
  | Record<string, never>

export type TaskActivityEntry = {
  taskId: string
  kind: TaskActivityKind
  actor: TaskActor
  detail?: TaskActivityDetail
  runId?: string | null
}

type Db = Pick<Prisma.TransactionClient, 'taskActivity'>

function row(e: TaskActivityEntry): Prisma.TaskActivityCreateManyInput {
  return {
    taskId: e.taskId,
    kind: e.kind,
    userId: e.actor?.kind === 'person' ? e.actor.userId : null,
    agentId: e.actor?.kind === 'agent' ? e.actor.agentId : null,
    runId: e.runId ?? null,
    detail: (e.detail ?? {}) as Prisma.InputJsonValue,
  }
}

export async function recordTaskActivity(entries: TaskActivityEntry | TaskActivityEntry[], db: Db = prisma): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries]
  if (list.length === 0) return
  try {
    await db.taskActivity.createMany({ data: list.map(row), skipDuplicates: true })
  } catch (err) {
    logger.error(`could not record ${list.map(e => `${e.kind} on ${e.taskId}`).join(', ')}`, err)
  }
}

/** Who a queuer is, as the activity names them: a person, or an agent (its session is not kept here). */
export function actorOf(who: { kind: 'person'; userId: string } | { kind: 'agent'; agentId: string } | null | undefined): TaskActor {
  if (!who) return null
  return who.kind === 'person' ? { kind: 'person', userId: who.userId } : { kind: 'agent', agentId: who.agentId }
}

export function personActor(userId: string): TaskActor {
  return { kind: 'person', userId }
}

/** The content fields an edit changed, compared with what the task held before. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter(k => after[k] !== undefined && JSON.stringify(after[k]) !== JSON.stringify(before[k]))
}
