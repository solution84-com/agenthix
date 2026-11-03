/**
 * A routine's template and schedule (spec §3, adr-0092): what each round is,
 * where it starts, and when. Validation and the task fields a round is created
 * with; no lifecycle here (routines.ts).
 */
import { prisma } from 'wasp/server'
import type { Prisma, Routine, TaskPriority } from '@prisma/client'
import { parseColumns, sortedColumns, findColumn, stateOfPlace, type TaskState } from '../projects/boardColumns'
import { ensureProjectTasks } from '../projects/boardService'
import { nextDueAfter, parseScheduleRule, roundUpToMinute, scheduleProblem, type Schedule, type ScheduleRule } from './scheduleRule'

export class RoutineError extends Error {}

export interface RoutineTemplate {
  title: string
  description: string | null
  priority: TaskPriority
  labels: string[]
  assignedAgentId: string | null
  /** A board, or null for the project's Project Tasks. */
  boardId: string | null
  /** A column of it, or null for its Backlog. */
  column: string | null
  /** The model each round's run names (`<providerId>/<model>`); null follows the default. */
  modelChoice: string | null
}

/** A template as given: a column left out is the board's first column on a named board, the Backlog otherwise. */
export type RoutineTemplateInput = Omit<RoutineTemplate, 'column' | 'modelChoice'> & { column?: string | null; modelChoice?: string | null }

export type RoutineScheduleInput = {
  /** ISO time the repeat is anchored at, or begins from; omitted = now. */
  at?: string | null
  /** Checked on the way in (parseScheduleRule): a caller may send anything. */
  rule: ScheduleRule | null
  timezone?: string | null
}

const PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH']

export function toPriority(value: string | null | undefined): TaskPriority {
  const upper = (value ?? 'MEDIUM').toUpperCase() as TaskPriority
  if (!PRIORITIES.includes(upper)) throw new RoutineError(`"${value}" is not a priority`)
  return upper
}

/** A routine always repeats: a one-off start time belongs on the task itself. */
export function toRoutineSchedule(input: RoutineScheduleInput, now: Date): Schedule {
  const rule = parseScheduleRule(input.rule)
  if (!rule) throw new RoutineError('A routine needs a repeat: every N minutes, hours or days, or a time on given weekdays')
  const given = input.at ? new Date(input.at) : now
  // A time that is not a time is left for scheduleProblem to name.
  const at = Number.isNaN(given.getTime()) ? given : roundUpToMinute(given)
  const schedule: Schedule = { at, rule, timezone: input.timezone || 'UTC' }
  const problem = scheduleProblem(schedule, now)
  if (problem) throw new RoutineError(problem.replace('A task cannot repeat', 'A routine cannot repeat'))
  return schedule
}

/**
 * When a new routine's first round comes. A start time given is the first round
 * if it is still to come. With none, the anchor is the next whole minute and the
 * first round is an interval after it, so a routine set up at 13:47:35 for every
 * 5 minutes comes at 13:53, not 13:48.
 */
export function firstRoundTime(input: RoutineScheduleInput, schedule: Schedule, now: Date): Date {
  const after = !input.at && schedule.rule?.kind === 'interval' ? schedule.at : now
  return nextDueAfter(schedule, after)!
}

export function routineScheduleOf(r: Pick<Routine, 'scheduleAt' | 'scheduleRule' | 'scheduleTimezone'>): Schedule | null {
  const rule = parseScheduleRule(r.scheduleRule)
  return rule ? { at: r.scheduleAt, rule, timezone: r.scheduleTimezone } : null
}

/** The routine's next time strictly after `after`; null only for a schedule no longer readable. */
export function nextRoundAfter(r: Pick<Routine, 'scheduleAt' | 'scheduleRule' | 'scheduleTimezone'>, after: Date): Date | null {
  const schedule = routineScheduleOf(r)
  return schedule ? nextDueAfter(schedule, after) : null
}

/**
 * Checks a template against its project: the board must be one of the
 * project's own, the column one of its board's (Project Tasks' when no board is
 * named), and the agent must be one assigned to the project.
 */
export async function checkTemplate(projectId: string, t: RoutineTemplateInput): Promise<RoutineTemplate> {
  if (!t.title.trim()) throw new RoutineError('A routine needs a title for its rounds')
  if (t.assignedAgentId) {
    const agent = await prisma.agent.findUnique({ where: { id: t.assignedAgentId }, select: { id: true } })
    if (!agent) throw new RoutineError('That agent does not exist')
    const assigned = await prisma.projectAgent.findUnique({
      where: { projectId_agentId: { projectId, agentId: t.assignedAgentId } }, select: { agentId: true },
    })
    if (!assigned) throw new RoutineError('That agent is not assigned to this project')
  }
  const boardId = t.boardId ?? (await ensureProjectTasks(projectId))
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true, columns: true, archivedAt: true } })
  if (!board || board.projectId !== projectId) throw new RoutineError("A routine's rounds start on one of its own project's boards")
  if (board.archivedAt) throw new RoutineError('That board is archived')
  const columns = sortedColumns(parseColumns(board.columns))
  const wanted = t.column === undefined ? (t.boardId ? columns[0]?.name ?? null : null) : t.column
  if (wanted !== null && !findColumn(columns, wanted)) throw new RoutineError(`"${wanted}" is not a column of that board`)
  return { ...t, title: t.title.trim(), column: wanted, modelChoice: t.modelChoice ?? null }
}

type Db = Pick<Prisma.TransactionClient, 'board' | 'agent' | 'sprint' | 'projectAgent'>

/**
 * Where a round starts, read at the moment it is created: the template's board
 * and column, the board's first column if that column has gone, or Project
 * Tasks' Backlog if the board has (or is archived). On a sprint board a round
 * in a column is in the current sprint. An agent deleted since leaves the
 * round unassigned, as does one no longer on the project's roster.
 */
export async function roundFields(db: Db, r: Routine): Promise<{
  boardId: string; column: string | null; status: TaskState; sprintId: string | null
  assignedAgentId: string | null
}> {
  const agent = r.assignedAgentId ? await db.agent.findUnique({ where: { id: r.assignedAgentId }, select: { id: true } }) : null
  const onRoster = agent && r.assignedAgentId
    ? await db.projectAgent.findUnique({ where: { projectId_agentId: { projectId: r.projectId, agentId: r.assignedAgentId } }, select: { agentId: true } })
    : null
  const assignedAgentId = onRoster ? r.assignedAgentId : null
  const board = r.boardId ? await db.board.findUnique({ where: { id: r.boardId }, select: { projectId: true, columns: true, kind: true, archivedAt: true } }) : null
  if (!board || board.projectId !== r.projectId || board.archivedAt) {
    const projectTasks = await ensureProjectTasks(r.projectId, db)
    const columns = parseColumns((await db.board.findUnique({ where: { id: projectTasks }, select: { columns: true } }))?.columns)
    const column = r.boardId === null && findColumn(columns, r.column) ? r.column : null
    return { boardId: projectTasks, column, status: stateOfPlace(columns, column), sprintId: null, assignedAgentId }
  }
  const columns = sortedColumns(parseColumns(board.columns))
  const column = r.column === null ? null : (findColumn(columns, r.column) ?? columns[0])?.name ?? null
  const sprint = board.kind === 'SPRINTS' && column !== null
    ? await db.sprint.findFirst({ where: { boardId: r.boardId!, finishedAt: null }, orderBy: { number: 'desc' }, select: { id: true } })
    : null
  return { boardId: r.boardId!, column, status: stateOfPlace(columns, column), sprintId: sprint?.id ?? null, assignedAgentId }
}

/** A round's plan by default: the day of its time, in the routine's timezone (adr-0098). */
export function roundPlan(at: Date, timezone: string): { planStart: Date; planFinish: Date } {
  const day = dayInZone(at, timezone)
  return { planStart: day, planFinish: day }
}

export function dayInZone(at: Date, timezone: string): Date {
  let ymd: string
  try {
    ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    ymd = at.toISOString().slice(0, 10)
  }
  return new Date(`${ymd}T00:00:00.000Z`)
}

export function labelsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
}
