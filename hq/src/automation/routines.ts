/**
 * A routine's life (spec §3, adr-0092): set up, edited, paused, turned back on,
 * deleted, and a round unlinked or deleted. Whatever happens, an enabled
 * routine keeps exactly one round waiting for its next time; the scheduler
 * moves it on when that time comes (routineRounds.ts). The callers check who
 * may; this keeps the rounds right.
 */
import { withExecutionState } from '../projects/executionState'
import { prisma } from 'wasp/server'
import { Prisma, type Routine } from '@prisma/client'
import { LOST_ACCESS_REASON } from '../projects/taskOnBehalfOf'
import { inRoutineTx, insertRound } from './routineRounds'
import {
  RoutineError, checkTemplate, firstRoundTime, labelsOf, nextRoundAfter, roundFields, toRoutineSchedule,
  roundPlan, type RoutineScheduleInput, type RoutineTemplate, type RoutineTemplateInput,
} from './routineTemplate'

type Tx = Prisma.TransactionClient

/** Who set a routine up: a person (through a connection, when they used one), or an agent in a run, for its person. */
export type RoutineCreator =
  | { kind: 'person'; userId: string; connectionId?: string }
  | { kind: 'agent'; agentId: string; sessionId: string; userId: string }

/** Why a routine paused itself: the person it is on behalf of can no longer reach its project. */
export const ROUTINE_LOST_ACCESS_REASON =
  'the person this routine is on behalf of can no longer work in its project — a project admin must take it over'

/**
 * Editing, pausing and deleting a routine, and unlinking its rounds, are for
 * its person or an admin of its project — as setting a start time is for the
 * task's person or a project admin (adr-0089).
 */
export async function mayManageRoutine(routine: Pick<Routine, 'projectId' | 'onBehalfOfUserId'>, userId: string): Promise<boolean> {
  if (routine.onBehalfOfUserId === userId) return true
  return isProjectAdmin(routine.projectId, userId)
}

export async function isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return member?.role === 'ADMIN'
}

export const NOT_YOURS_TO_MANAGE =
  'Only the person this routine is done on behalf of, or an admin of its project, can change it'

function createdBy(c: RoutineCreator) {
  return {
    createdByUserId: c.userId,
    createdByAgentId: c.kind === 'agent' ? c.agentId : null,
    createdBySessionId: c.kind === 'agent' ? c.sessionId : null,
    createdByConnectionId: c.kind === 'person' ? c.connectionId ?? null : null,
  }
}

/** Sets a routine up, on, with its first round waiting for its next time. */
export async function createRoutine(
  projectId: string,
  template: RoutineTemplateInput,
  scheduleInput: RoutineScheduleInput,
  creator: RoutineCreator,
  now: Date = new Date(),
): Promise<Routine> {
  const checked = await checkTemplate(projectId, template)
  const schedule = toRoutineSchedule(scheduleInput, now)
  const first = firstRoundTime(scheduleInput, schedule, now)
  const { routine, boardId } = await inRoutineTx(async tx => {
    const routine = await tx.routine.create({
      data: {
        projectId, ...checked, scheduleAt: schedule.at,
        scheduleRule: schedule.rule as unknown as Prisma.InputJsonValue, scheduleTimezone: schedule.timezone,
        enabled: true, nextRoundAt: first, onBehalfOfUserId: creator.userId, ...createdBy(creator),
      },
    })
    const round = await insertRound(tx, routine, first)
    return { routine, boardId: round.boardId }
  })
  await boardsChanged([boardId])
  return routine
}

/**
 * "Make this a routine" (spec §3): a routine whose template is the task's, set
 * up by `creator`, with the task linked to it. A task whose start time is still
 * to come becomes the first round, at that time, which starts it as its start
 * time would have (adr-0104). Otherwise the routine creates its first round at
 * its next time.
 */
export async function makeRoutineFromTask(
  taskId: string,
  scheduleInput: RoutineScheduleInput,
  creator: RoutineCreator,
  now: Date = new Date(),
): Promise<Routine> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new RoutineError('Task not found')
  if (task.routineId) throw new RoutineError('This task is already a round of a routine')
  if (task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON) {
    throw new RoutineError('This task is blocked until a project admin chooses who it is done on behalf of')
  }
  const checked = await checkTemplate(task.projectId, {
    title: task.title, description: task.description, priority: task.priority, labels: labelsOf(task.labels),
    assignedAgentId: task.assignedAgentId, boardId: task.boardId, column: task.column, modelChoice: task.modelChoice,
  })
  const schedule = toRoutineSchedule(scheduleInput, now)
  const startToCome = task.scheduleAt && task.scheduleNextDueAt && task.scheduleAt.getTime() > now.getTime() ? task.scheduleAt : null
  const first = startToCome ?? firstRoundTime(scheduleInput, schedule, now)

  const { routine, boards } = await inRoutineTx(async tx => {
    const routine = await tx.routine.create({
      data: {
        projectId: task.projectId, ...checked, scheduleAt: schedule.at,
        scheduleRule: schedule.rule as unknown as Prisma.InputJsonValue, scheduleTimezone: schedule.timezone,
        enabled: true, nextRoundAt: first, onBehalfOfUserId: creator.userId, ...createdBy(creator),
      },
    })
    await tx.task.update({
      where: { id: task.id },
      data: {
        routineId: routine.id,
        onBehalfOfUserId: creator.userId,
        ...(startToCome
          ? {
              roundAt: startToCome, scheduleAt: null, scheduleNextDueAt: null,
              scheduleSetByUserId: null, scheduleSetByAgentId: null, scheduleSetBySessionId: null, scheduleSetByConnectionId: null,
            }
          : {}),
      },
    })
    const boards = [task.boardId]
    if (!startToCome) boards.push((await insertRound(tx, routine, first)).boardId)
    return { routine, boards }
  })
  await boardsChanged(boards)
  return routine
}

export interface RoutineChange {
  template?: Partial<RoutineTemplateInput>
  schedule?: RoutineScheduleInput
  /** A project admin taking it over (the caller checks). */
  onBehalfOfUserId?: string
}

/**
 * Edits a routine; its waiting round follows. A project admin taking over a
 * routine its person lost access to turns it back on, and releases its blocked
 * waiting round to the new person.
 */
export async function updateRoutine(routineId: string, change: RoutineChange, now: Date = new Date()): Promise<Routine> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new RoutineError('Routine not found')
  const template = await checkTemplate(routine.projectId, { ...templateOf(routine), ...change.template })
  const schedule = change.schedule ? toRoutineSchedule(change.schedule, now) : null
  const takingOver = change.onBehalfOfUserId !== undefined && change.onBehalfOfUserId !== routine.onBehalfOfUserId
  const resumes = takingOver && routine.pausedReason === ROUTINE_LOST_ACCESS_REASON

  const boards = await inRoutineTx(async tx => {
    const updated = await tx.routine.update({
      where: { id: routineId },
      data: {
        ...template,
        ...(schedule
          ? { scheduleAt: schedule.at, scheduleRule: schedule.rule as unknown as Prisma.InputJsonValue, scheduleTimezone: schedule.timezone }
          : {}),
        ...(takingOver ? { onBehalfOfUserId: change.onBehalfOfUserId } : {}),
        ...(resumes ? { enabled: true, pausedReason: null } : {}),
      },
    })
    if (resumes) await releaseWaitingRound(tx, updated, now)
    if (!updated.enabled) return []
    const keepTime = !schedule && updated.nextRoundAt && updated.nextRoundAt.getTime() > now.getTime()
    const next = keepTime ? updated.nextRoundAt! : schedule && change.schedule ? firstRoundTime(change.schedule, schedule, now) : nextRoundAfter(updated, now)
    return syncWaitingRound(tx, updated, next, now)
  })
  await boardsChanged(boards)
  return (await prisma.routine.findUnique({ where: { id: routineId } }))!
}

/** Pauses a routine: its waiting round, if it has not reached its time, is removed. */
export async function pauseRoutine(routineId: string, now: Date = new Date()): Promise<void> {
  const boards = await inRoutineTx(async tx => {
    const routine = await tx.routine.update({ where: { id: routineId }, data: { enabled: false, nextRoundAt: null } })
    return removeWaitingRound(tx, routine.id, now)
  })
  await boardsChanged(boards)
}

/** Turns a routine back on, with a fresh round for its next time. */
export async function resumeRoutine(routineId: string, now: Date = new Date()): Promise<void> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new RoutineError('Routine not found')
  if (routine.pausedReason === ROUTINE_LOST_ACCESS_REASON) {
    throw new RoutineError('This routine stays paused until a project admin takes it over')
  }
  if (routine.enabled) return
  const boards = await inRoutineTx(async tx => {
    const on = await tx.routine.update({ where: { id: routineId }, data: { enabled: true, pausedReason: null } })
    return syncWaitingRound(tx, on, nextRoundAfter(on, now), now)
  })
  await boardsChanged(boards)
}

/** Deletes a routine and its waiting round; earlier rounds stay, unlinked. */
export async function deleteRoutine(routineId: string, now: Date = new Date()): Promise<void> {
  const boards = await inRoutineTx(async tx => {
    const boards = await removeWaitingRound(tx, routineId, now)
    await tx.routine.delete({ where: { id: routineId } })
    return boards
  })
  await boardsChanged(boards)
}

/**
 * Unlinks a round. The waiting round becomes a plain scheduled task — a start
 * at its time on behalf of its person — and the routine moves on to the time
 * after it. Any other round is simply no longer linked.
 */
export async function unlinkRound(taskId: string, now: Date = new Date()): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, routineId: true, roundAt: true, boardId: true, onBehalfOfUserId: true },
  })
  if (!task?.routineId) return
  const waitingAt = task.roundAt && task.roundAt.getTime() > now.getTime() ? task.roundAt : null
  const boards = await inRoutineTx(async tx => {
    await tx.task.update({
      where: { id: task.id },
      data: waitingAt
        ? { routineId: null, roundAt: null, scheduleAt: waitingAt, scheduleNextDueAt: waitingAt, scheduleSetByUserId: task.onBehalfOfUserId }
        : { routineId: null },
    })
    const boards = [task.boardId]
    if (waitingAt) boards.push(...(await skipPast(tx, task.routineId!, waitingAt, now)))
    return boards
  })
  await boardsChanged(boards)
}

/** A deleted waiting round skips that one time: the routine creates the round after it. */
export async function roundDeleted(task: { routineId: string | null; roundAt: Date | null }, now: Date = new Date()): Promise<void> {
  if (!task.routineId || !task.roundAt || task.roundAt.getTime() <= now.getTime()) return
  const boards = await inRoutineTx(tx => skipPast(tx, task.routineId!, task.roundAt!, now))
  await boardsChanged(boards)
}

/**
 * Pauses the routines of a person who lost access to their projects. Their
 * waiting rounds stay, blocked like their other tasks (lossOfAccess.ts), until
 * a project admin takes the routine over.
 */
export async function pauseRoutinesForLostAccess(where: Prisma.RoutineWhereInput): Promise<number> {
  const { count } = await prisma.routine.updateMany({
    where: { AND: [where, { enabled: true }] },
    data: { enabled: false, pausedReason: ROUTINE_LOST_ACCESS_REASON },
  })
  return count
}

// ── Keeping the waiting round right ───────────────────────────────────────────

function templateOf(r: Routine): RoutineTemplate {
  return {
    title: r.title, description: r.description, priority: r.priority, labels: labelsOf(r.labels),
    assignedAgentId: r.assignedAgentId, boardId: r.boardId, column: r.column, modelChoice: r.modelChoice,
  }
}

function findWaiting(tx: Tx, routineId: string, now: Date) {
  return tx.task.findFirst({ where: { routineId, roundAt: { gt: now } }, orderBy: { roundAt: 'desc' } })
}

/** Makes the waiting round match the routine, for `at`; creates it if there is none. Returns the boards changed. */
async function syncWaitingRound(tx: Tx, routine: Routine, at: Date | null, now: Date): Promise<string[]> {
  await tx.routine.update({ where: { id: routine.id }, data: { nextRoundAt: at } })
  if (!at) return []
  const waiting = await findWaiting(tx, routine.id, now)
  if (!waiting) return [(await insertRound(tx, routine, at)).boardId]
  const place = await roundFields(tx, routine)
  const moved = place.boardId !== waiting.boardId || place.column !== waiting.column
  // A plan still at its round's old day follows the round; one a person changed stays.
  const oldPlan = waiting.roundAt ? roundPlan(waiting.roundAt, routine.scheduleTimezone) : null
  const planIsDefault = !!oldPlan && waiting.planStart?.getTime() === oldPlan.planStart.getTime() && waiting.planFinish?.getTime() === oldPlan.planFinish.getTime()
  await tx.task.update({
    where: { id: waiting.id },
    data: {
      title: routine.title, description: routine.description, priority: routine.priority, labels: labelsOf(routine.labels),
      assignedAgentId: place.assignedAgentId, modelChoice: routine.modelChoice, onBehalfOfUserId: routine.onBehalfOfUserId, roundAt: at,
      ...(planIsDefault ? roundPlan(at, routine.scheduleTimezone) : {}),
      ...(moved ? { boardId: place.boardId, column: place.column, status: place.status, sprintId: place.sprintId } : {}),
    },
  })
  return [waiting.boardId, place.boardId]
}

/** Removes the waiting round; one a person already started or queued is kept, as no longer waiting. */
async function removeWaitingRound(tx: Tx, routineId: string, now: Date): Promise<string[]> {
  const waiting = await tx.task.findMany({ where: { routineId, roundAt: { gt: now } }, select: { id: true, runState: true, boardId: true } })
  for (const t of waiting) {
    if (t.runState === 'RUN_NONE') await tx.task.delete({ where: { id: t.id } })
    else await tx.task.update({ where: { id: t.id }, data: { roundAt: null } })
  }
  return waiting.map(t => t.boardId)
}

/** Moves the routine on past a round that is no longer waiting at `at`, creating the round after it. */
export async function skipPast(tx: Tx, routineId: string, at: Date, now: Date): Promise<string[]> {
  const routine = await tx.routine.findUnique({ where: { id: routineId } })
  if (!routine?.enabled || routine.nextRoundAt?.getTime() !== at.getTime()) return []
  const next = nextRoundAfter(routine, new Date(Math.max(at.getTime(), now.getTime())))
  const { count } = await tx.routine.updateMany({ where: { id: routineId, nextRoundAt: at }, data: { nextRoundAt: next } })
  if (count === 0 || !next) return []
  return [(await insertRound(tx, routine, next)).boardId]
}

/** The waiting round a lost-access pause left blocked, handed to the routine's new person. */
async function releaseWaitingRound(tx: Tx, routine: Routine, now: Date): Promise<void> {
  await tx.task.updateMany({
    where: { routineId: routine.id, roundAt: { gt: now }, runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON },
    data: { ...withExecutionState({ runState: 'RUN_NONE', runStateReason: null }), onBehalfOfUserId: routine.onBehalfOfUserId },
  })
}

export async function boardsChanged(boards: string[]): Promise<void> {
  const ids = new Set(boards)
  if (ids.size === 0) return
  const { emitTaskUpdated } = await import('../server/socket')
  ids.forEach(b => emitTaskUpdated(b))
}
