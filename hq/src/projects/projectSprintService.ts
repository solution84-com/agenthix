/**
 * A project's sprints (adr-0176, spec D8, D13, N1, N7): one series per project, one length for every type. The
 * current sprint is the lowest-numbered not finished; up to two more may be planned ahead. Adding a Backlog task to a
 * sprint commits to it: it moves to To do, on its type's default To do column (N1). A sprint is finished only
 * explicitly, and stays current, overdue, after its last day; its unfinished tasks move on to the next sprint or are
 * left in none, their state and column as they were. A sprint board is any board filtered to a sprint.
 *
 * Every change to the series takes the project's sprint lock, so a task is never planned into a sprint being
 * finished, and two finishes at once finish it once. No auth, no HTTP: sprintOperations.ts checks who may.
 *
 * The deprecated sprints of a sprint board (adr-0097) are sprintService.ts's, and are not read here.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { stateOnSprintAdd } from '@agenthix/core'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { notifyBoardsOfTasks } from './boardNotify'
import { recordTaskActivity, type TaskActor } from './taskActivity'
import { moveTask } from './taskColumnService'
import type { OrderPlace } from './taskPlace'
import {
  currentOf, nextSpan, relaidUpcoming, SPRINT_GOAL_MAX_LENGTH, SPRINT_NAME_MAX_LENGTH, seriesDays, seriesParts, sortedSeries,
  spanFrom, sprintDaysProblem, UPCOMING_SPRINTS_MAX,
} from './sprintSeries'

type Tx = Prisma.TransactionClient

export const SPRINT_SELECT = {
  id: true, projectId: true, number: true, name: true, goal: true, startDate: true, finishDate: true, finishedAt: true,
  unfinishedCount: true, unfinishedMovedOn: true,
} satisfies Prisma.SprintSelect

export type SprintRow = Prisma.SprintGetPayload<{ select: typeof SPRINT_SELECT }>

export const SPRINT_FINISHED = 'That sprint is finished: its record is kept as it was. Nothing was changed.'
export const SPRINTS_ALREADY_STARTED = 'This project has sprints already: plan the next one instead. Nothing was changed.'
export const NO_SPRINTS = 'This project has no sprints yet: start them first. Nothing was changed.'
export const EPIC_NOT_IN_SPRINT = 'An epic is not planned into a sprint: plan its tasks instead. Nothing was changed.'
export const ONLY_CURRENT_FINISHES = 'Only the current sprint can be finished; finish the ones before it first. Nothing was changed.'
export const SAY_WHERE_UNFINISHED = 'Say where the tasks not done go: "next" (the next sprint) or "none" (no sprint). Nothing was changed.'

const NOT_FOUND = 'Sprint not found'

async function lockSeries(tx: Tx, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sprint-series'), hashtext(${projectId}))`
}

export function seriesOf(db: Tx | typeof prisma, projectId: string): Promise<SprintRow[]> {
  // A project's own sprints; a sprint board's (adr-0097) has a board and is not one of them.
  return db.sprint.findMany({ where: { projectId, boardId: null }, select: SPRINT_SELECT, orderBy: { number: 'asc' } })
}

export async function sprintOf(sprintId: string): Promise<SprintRow & { projectId: string }> {
  const s = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { ...SPRINT_SELECT, boardId: true } })
  if (!s || s.boardId !== null || s.projectId === null) throw new HttpError(404, NOT_FOUND)
  const { boardId: _board, ...row } = s
  return { ...row, projectId: s.projectId }
}

function optionalText(raw: unknown, max: number, what: string): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') throw new HttpError(400, `${what} must be text. Nothing was changed.`)
  const text = raw.trim()
  if (text.length > max) throw new HttpError(400, `${what} is at most ${max} characters. Nothing was changed.`)
  return text === '' ? null : text
}

/** Starts the project's series: Sprint 1, from `startDate`, `days` long. */
export async function startSprints(projectId: string, params: { startDate: Date; days: number }): Promise<SprintRow> {
  const problem = sprintDaysProblem(params.days)
  if (problem) throw new HttpError(400, problem)
  if (!(params.startDate instanceof Date) || Number.isNaN(params.startDate.getTime())) throw new HttpError(400, 'Say the day the first sprint begins. Nothing was changed.')
  const created = await prisma.$transaction(async (tx) => {
    await lockSeries(tx, projectId)
    if ((await seriesOf(tx, projectId)).length > 0) throw new HttpError(409, SPRINTS_ALREADY_STARTED)
    return tx.sprint.create({ data: { projectId, number: 1, ...spanFrom(params.startDate, params.days) }, select: SPRINT_SELECT })
  })
  triggerSnapshotPush()
  return created
}

async function createNext(tx: Tx, projectId: string, series: SprintRow[]): Promise<SprintRow> {
  const newest = sortedSeries(series).at(-1)!
  return tx.sprint.create({
    data: { projectId, number: newest.number + 1, ...nextSpan(newest, seriesDays(series)!) },
    select: SPRINT_SELECT,
  })
}

/** Plans the next sprint in the series ahead: at most two after the current one. */
export async function addNextSprint(projectId: string): Promise<SprintRow> {
  const created = await prisma.$transaction(async (tx) => {
    await lockSeries(tx, projectId)
    const series = await seriesOf(tx, projectId)
    if (series.length === 0) throw new HttpError(409, NO_SPRINTS)
    if (seriesParts(series).upcoming.length >= UPCOMING_SPRINTS_MAX) {
      throw new HttpError(409, `Up to ${UPCOMING_SPRINTS_MAX} sprints after the current one can be planned ahead. Nothing was changed.`)
    }
    return createNext(tx, projectId, series)
  })
  triggerSnapshotPush()
  return created
}

/** The series' new length: the current sprint keeps its dates, as it is under way; the upcoming ones follow it. */
export async function setSprintLength(projectId: string, days: number): Promise<SprintRow[]> {
  const problem = sprintDaysProblem(days)
  if (problem) throw new HttpError(400, problem)
  return prisma.$transaction(async (tx) => {
    await lockSeries(tx, projectId)
    const series = await seriesOf(tx, projectId)
    const { current, upcoming } = seriesParts(series)
    if (!current) throw new HttpError(409, NO_SPRINTS)
    if (upcoming.length === 0) {
      // The series' length is its newest sprint's: with none ahead, the next is planned at the new length.
      const next = await tx.sprint.create({ data: { projectId, number: current.number + 1, ...nextSpan(current, days) }, select: SPRINT_SELECT })
      return [...series, next]
    }
    for (const s of relaidUpcoming(current, upcoming, days)) {
      await tx.sprint.update({ where: { id: s.id }, data: { startDate: s.startDate, finishDate: s.finishDate } })
    }
    return seriesOf(tx, projectId)
  })
}

/** Renames a sprint (its number stays) or sets its goal; null clears either. */
export async function updateProjectSprint(sprintId: string, params: { name?: unknown; goal?: unknown }): Promise<SprintRow> {
  await sprintOf(sprintId)
  const data: { name?: string | null; goal?: string | null } = {}
  if (params.name !== undefined) data.name = optionalText(params.name, SPRINT_NAME_MAX_LENGTH, "A sprint's name")
  if (params.goal !== undefined) data.goal = optionalText(params.goal, SPRINT_GOAL_MAX_LENGTH, "A sprint's goal")
  return prisma.sprint.update({ where: { id: sprintId }, data, select: SPRINT_SELECT })
}

/**
 * Plans tasks into a sprint not finished. A Backlog task moves to To do, on its type's default column (N1); any other
 * keeps its state. With one task, `place` puts it in the project's order (the sprint list's order is the rank).
 */
export async function planIntoSprint(sprintId: string, taskIds: string[], place: OrderPlace = {}, actor: TaskActor = null): Promise<string[]> {
  const sprint = await sprintOf(sprintId)
  const ids = [...new Set(taskIds)]
  if (ids.length === 0) return []
  const reorders = !!(place.afterTaskId || place.beforeTaskId)
  if (reorders && ids.length !== 1) throw new HttpError(400, 'A place in the order is given for one task at a time. Nothing was changed.')

  const tasks = await prisma.$transaction(async (tx) => {
    await lockSeries(tx, sprint.projectId)
    const fresh = await tx.sprint.findUnique({ where: { id: sprintId }, select: { finishedAt: true } })
    if (!fresh || fresh.finishedAt) throw new HttpError(409, SPRINT_FINISHED)
    const found = await tx.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true, archived: true, state: true, sprintId: true, isEpic: true, type: { select: { kind: true } } },
    })
    if (found.length !== ids.length || found.some(t => t.projectId !== sprint.projectId)) {
      throw new HttpError(400, "Every task planned into a sprint is one of the sprint's project's. Nothing was changed.")
    }
    if (found.some(t => t.archived)) throw new HttpError(400, 'An archived task is not planned: bring it back first. Nothing was changed.')
    if (found.some(t => t.isEpic || t.type?.kind === 'EPIC')) throw new HttpError(400, EPIC_NOT_IN_SPRINT)
    const leaving = await tx.sprint.findMany({ where: { id: { in: found.map(t => t.sprintId).filter((s): s is string => !!s) }, finishedAt: { not: null } }, select: { id: true } })
    if (leaving.length > 0) throw new HttpError(409, 'A task in a finished sprint stays in its record. Nothing was changed.')
    await tx.task.updateMany({ where: { id: { in: ids } }, data: { sprintId } })
    return found
  })

  for (const t of tasks) {
    const committed = stateOnSprintAdd(t.state)
    if (committed !== t.state) await moveTask(t.id, { state: committed, ...place }, actor)
    else if (reorders) await moveTask(t.id, place, actor)
  }
  const changed = tasks.filter(t => t.sprintId !== sprintId).map(t => t.id)
  await recordTaskActivity(changed.map(taskId => ({ taskId, kind: 'EDITED' as const, actor, detail: { fields: ['sprintId'] } })))
  await notifyBoardsOfTasks(ids)
  triggerSnapshotPush()
  return ids
}

/** Takes tasks out of their sprint, their state and column as they are. A finished sprint keeps its record. */
export async function takeOutOfSprint(projectId: string, taskIds: string[], actor: TaskActor = null): Promise<string[]> {
  const ids = [...new Set(taskIds)]
  if (ids.length === 0) return []
  const taken = await prisma.$transaction(async (tx) => {
    await lockSeries(tx, projectId)
    const found = await tx.task.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true, sprintId: true, sprint: { select: { finishedAt: true } } } })
    if (found.length !== ids.length || found.some(t => t.projectId !== projectId)) {
      throw new HttpError(400, "Every task is one of this project's. Nothing was changed.")
    }
    if (found.some(t => t.sprint?.finishedAt)) throw new HttpError(409, 'A task in a finished sprint stays in its record. Nothing was changed.')
    const inSprint = found.filter(t => t.sprintId !== null).map(t => t.id)
    await tx.task.updateMany({ where: { id: { in: inSprint } }, data: { sprintId: null } })
    return inSprint
  })
  await recordTaskActivity(taken.map(taskId => ({ taskId, kind: 'EDITED' as const, actor, detail: { fields: ['sprintId'] } })))
  await notifyBoardsOfTasks(taken)
  triggerSnapshotPush()
  return taken
}

export type UnfinishedGoTo = 'next' | 'none'

export function unfinishedGoTo(raw: unknown): UnfinishedGoTo | undefined {
  if (raw === undefined || raw === null) return undefined
  if (raw !== 'next' && raw !== 'none') throw new HttpError(400, SAY_WHERE_UNFINISHED)
  return raw
}

/**
 * Finishes the current sprint. Its done tasks stay recorded in it; the rest move on to the next sprint or are left
 * in no sprint, as `unfinished` says. With nothing unfinished, it finishes at once. The series goes on: the next
 * sprint, planned or made now, becomes current.
 */
export async function finishProjectSprint(sprintId: string, unfinished: UnfinishedGoTo | undefined, actor: TaskActor = null, now = new Date()) {
  const sprint = await sprintOf(sprintId)
  const result = await prisma.$transaction(async (tx) => {
    await lockSeries(tx, sprint.projectId)
    const series = await seriesOf(tx, sprint.projectId)
    const current = currentOf(series)
    const self = series.find(s => s.id === sprintId)!
    if (self.finishedAt) throw new HttpError(409, SPRINT_FINISHED)
    if (current?.id !== sprintId) throw new HttpError(409, ONLY_CURRENT_FINISHES)
    const open = await tx.task.findMany({ where: { sprintId, state: { not: 'DONE' } }, select: { id: true } })
    if (open.length > 0 && !unfinished) throw new HttpError(400, SAY_WHERE_UNFINISHED)
    const next = seriesParts(series).upcoming[0] ?? await createNext(tx, sprint.projectId, series)
    const movedOn = open.length > 0 && unfinished === 'next'
    const ids = open.map(t => t.id)
    await tx.task.updateMany({ where: { id: { in: ids } }, data: { sprintId: movedOn ? next.id : null } })
    const finished = await tx.sprint.update({
      where: { id: sprintId },
      data: { finishedAt: now, unfinishedCount: open.length, unfinishedMovedOn: movedOn },
      select: SPRINT_SELECT,
    })
    return { finished, next, movedTaskIds: ids, unfinished: open.length > 0 ? unfinished! : null }
  })
  await recordTaskActivity(result.movedTaskIds.map(taskId => ({ taskId, kind: 'EDITED' as const, actor, detail: { fields: ['sprintId'] } })))
  await notifyBoardsOfTasks(result.movedTaskIds)
  triggerSnapshotPush()
  return result
}
