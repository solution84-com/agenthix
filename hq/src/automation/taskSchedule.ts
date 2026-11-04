/**
 * Setting or clearing a task's start time (spec §3) — once: a task starts at
 * most once (adr-0092). Shared by a person's action
 * (with the task-edit permission) and an agent's tool (only in a run a person
 * started, where the boundary allows it) — the callers check who may; this
 * validates the schedule, stores who set it, and stores when it is next due.
 *
 * Setting a schedule also makes the task done on behalf of the person behind
 * it (spec §5, adr-0089): the one who set it, or the one whose run the setting
 * agent was in. Its scheduled starts then run on their behalf.
 */
import { prisma } from 'wasp/server'
import { LOST_ACCESS_REASON } from '../projects/taskOnBehalfOf'
import { queueRunIfNone, withdrawPendingRun } from '../projects/taskRunMoves'
import { findColumn, parseColumns } from '../projects/boardColumns'
import { nudgeScheduler } from './schedulerNudge'
import { roundUpToMinute } from './scheduleRule'

export interface ScheduleInput {
  /** ISO time the task starts at. */
  at?: string | null
}

export type ScheduleSetter =
  /** A person — through one of their connections when they used one (adr-0090). */
  | { kind: 'person'; userId: string; connectionId?: string }
  /** An agent in a run: its session, and the person the run was for. */
  | { kind: 'agent'; agentId: string; sessionId: string; userId: string }

export class ScheduleError extends Error {}

/**
 * Setting or clearing a schedule decides who answers for the task, so it is
 * for the person it is already done on behalf of, or a project admin, who alone
 * may reassign it (adr-0089). Anyone else asks one of them.
 */
export async function mayScheduleTask(taskId: string, userId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, onBehalfOfUserId: true } })
  if (!task) return false
  if (task.onBehalfOfUserId === userId) return true
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: task.projectId, userId } },
    select: { role: true },
  })
  return member?.role === 'ADMIN'
}

export const NOT_YOURS_TO_SCHEDULE =
  "Only the person this task is done on behalf of, or an admin of its project, can change its schedule"

export interface StoredSchedule {
  scheduleAt: Date | null
  scheduleNextDueAt: Date | null
}

/** Validates a start time, or throws ScheduleError saying why not. */
export function toStartTime(input: ScheduleInput, now: Date): Date {
  if (!input.at) throw new ScheduleError('A start time is needed')
  const given = new Date(input.at)
  if (Number.isNaN(given.getTime())) throw new ScheduleError('The start time is not a valid time')
  const at = roundUpToMinute(given)
  if (at.getTime() <= now.getTime()) throw new ScheduleError('A start time must be in the future')
  return at
}

export async function setTaskSchedule(
  taskId: string,
  input: ScheduleInput,
  setter: ScheduleSetter,
  now: Date = new Date(),
): Promise<StoredSchedule> {
  const at = toStartTime(input, now)
  // Setting a schedule moves who the task is done on behalf of, so on a task
  // blocked because its person lost access it would release the block —
  // which only a project admin choosing someone else may do.
  const current = await prisma.task.findUnique({ where: { id: taskId }, select: { runState: true, runStateReason: true } })
  if (current?.runState === 'RUN_BLOCKED' && current.runStateReason === LOST_ACCESS_REASON) {
    throw new ScheduleError('This task is blocked until a project admin chooses who it is done on behalf of')
  }
  const stored = await prisma.task.update({
    where: { id: taskId },
    data: {
      scheduleAt: at,
      scheduleNextDueAt: at,
      onBehalfOfUserId: setter.userId,
      scheduleSetByUserId: setter.userId,
      scheduleSetByAgentId: setter.kind === 'agent' ? setter.agentId : null,
      scheduleSetBySessionId: setter.kind === 'agent' ? setter.sessionId : null,
      scheduleSetByConnectionId: setter.kind === 'person' ? setter.connectionId ?? null : null,
    },
    select: { scheduleAt: true, scheduleNextDueAt: true },
  })
  // A run queued or throttled before the time was set must not start early: it starts at its time, as a Run asked
  // for later (spec §3). One already going keeps going; its start time stands for later.
  await withdrawPendingRun(taskId)
  return stored
}

export async function clearTaskSchedule(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      scheduleAt: null, scheduleNextDueAt: null,
      scheduleSetByUserId: null, scheduleSetByAgentId: null, scheduleSetBySessionId: null, scheduleSetByConnectionId: null,
    },
  })
  await requeueInAutoQueueColumn(taskId)
}

/** With its start time gone, a task in a column that queues automatically is an ordinary task again: the column queues it. */
async function requeueInAutoQueueColumn(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true, column: true } })
  if (!task?.boardId || !task.column) return
  const board = await prisma.board.findUnique({ where: { id: task.boardId }, select: { columns: true } })
  const column = board ? findColumn(parseColumns(board.columns), task.column) : undefined
  if (!column?.autoQueue || column.status === 'DONE') return
  if (await queueRunIfNone(taskId, null)) nudgeScheduler()
}
