/**
 * The timeline (every screen reviewed spec §3, adr-0098): for a project, or one
 * of its boards, and a date range — the tasks with their plans, start times and
 * the slices of work their runs did; epics with their span; milestones; and the
 * rounds routines will create. Backlog is not on it: it has no time yet, so each
 * board carries its Backlog count instead.
 *
 * Runs are the site's, read the way the run feed reads them: one `run.listPage`
 * from the site holding the project's storage, starting at the range's end and
 * asking for the shown tasks' runs only, so a timeline costs one round trip,
 * never one per task, and the rest of the site's history cannot crowd it out.
 */
import { HttpError, prisma } from 'wasp/server'
import { RUN_TASK_IDS_MAX } from '@agenthix/core'
import type { BoardKind, TaskPriority, TaskRunState, TaskStatus } from '@prisma/client'
import { requireBoardVisible, requireProjectVisible } from './resourceEntitlement'
import { projectTasksFirst, ensureProjectTasks } from './boardService'
import { epicSpan } from './planSpan'
import { needsYou } from './needsYou'
import { sprintView, type SprintView } from './boardView'
import { inRange, knownRange, pageCursorAt, planOverlaps, roundsIn, runSlices, timelineRange, type Range, type RunSlice } from './timelineRange'
import { routineScheduleOf } from '../automation/routineTemplate'
import { listRunsPage } from '../sessions/siteRuntimeStore'
import { resolveExecutionSiteId } from '../server/identity/capabilityService'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Timeline')
/** The site's page ceiling: tasks with more runs than this in the range show their latest work and say the rest is missing. */
const RUN_PAGE = 1000

export type TimelineTask = {
  id: string
  key: string
  title: string
  boardId: string | null
  column: string | null
  status: TaskStatus
  priority: TaskPriority
  runState: TaskRunState
  needsYou: boolean
  assignedAgent: { id: string; name: string; handle: string } | null
  epicId: string | null
  /** Plan: the bar. */
  planStart: Date | null
  planFinish: Date | null
  /** Schedule: ▶ — its start time, or its routine round's time. */
  startAt: Date | null
  roundAt: Date | null
  routineId: string | null
}

export type TimelineEpic = Omit<TimelineTask, 'epicId'> & {
  milestoneId: string | null
  /** Its own plan, else its tasks' span; null when neither has dates. */
  span: { start: Date; finish: Date; fromTasks: boolean } | null
  taskIds: string[]
}

export type Timeline = {
  from: Date
  to: Date
  /** The range was cut to a window around today, because the dates known span more than a range may. */
  capped: boolean
  boards: Array<{ id: string; name: string; kind: BoardKind; backlogCount: number; sprints: SprintView[] }>
  tasks: TimelineTask[]
  epics: TimelineEpic[]
  milestones: Array<{ id: string; name: string; date: Date; epicIds: string[] }>
  routineRounds: Array<{ routineId: string; title: string; boardId: string; at: Date[]; more: boolean }>
  /** `unavailable` says why runs are missing (the site could not be asked), so none is never read as no work. */
  runs: { slices: RunSlice[]; unavailable: string | null; truncated: boolean }
}

const TASK_SELECT = {
  id: true, number: true, title: true, boardId: true, column: true, status: true, priority: true,
  runState: true, runStateReason: true, assignedAgentId: true, epicId: true, isEpic: true, milestoneId: true,
  planStart: true, planFinish: true, scheduleNextDueAt: true, roundAt: true, routineId: true,
  assignedAgent: { select: { id: true, name: true, handle: true } },
} as const

export const getTimeline = async (
  { projectId, boardId, from, to }: { projectId: string; boardId?: string; from?: string; to?: string },
  context: { user?: { id: string } | null },
): Promise<Timeline> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectVisible(projectId, context.user.id)
  if (boardId && (await requireBoardVisible(boardId, context.user.id)) !== projectId) throw new HttpError(404, 'Board not found')
  const now = new Date()
  // Without a range the timeline covers everything known, for the chart to scroll across.
  const range = from && to ? { ...timelineRange(from, to), capped: false } : await knownProjectRange(projectId, boardId ?? null, now)
  return readTimeline(projectId, boardId ?? null, range, now)
}

async function knownProjectRange(projectId: string, boardId: string | null, now: Date) {
  const [tasks, worked, sprints, milestones] = await Promise.all([
    prisma.task.aggregate({
      where: { projectId, archived: false, ...(boardId ? { OR: [{ boardId }, { isEpic: true }] } : {}) },
      _min: { planStart: true, planFinish: true, scheduleNextDueAt: true, roundAt: true },
      _max: { planStart: true, planFinish: true, scheduleNextDueAt: true, roundAt: true },
    }),
    // The runs are the site's; a task that was worked is the nearest thing hq knows to when its runs began and ended.
    prisma.task.aggregate({
      where: { projectId, archived: false, lastWorkedAt: { not: null }, ...(boardId ? { boardId } : {}) },
      _min: { createdAt: true },
      _max: { lastWorkedAt: true },
    }),
    prisma.sprint.aggregate({
      where: boardId ? { boardId } : { board: { projectId, archivedAt: null } },
      _min: { startDate: true },
      _max: { finishDate: true },
    }),
    prisma.milestone.aggregate({ where: { projectId }, _min: { date: true }, _max: { date: true } }),
  ])
  return knownRange([
    ...Object.values(tasks._min), ...Object.values(tasks._max),
    worked._min.createdAt, worked._max.lastWorkedAt,
    sprints._min.startDate, sprints._max.finishDate,
    milestones._min.date, milestones._max.date,
  ], now)
}

export async function readTimeline(projectId: string, boardId: string | null, range: Range & { capped?: boolean }, now: Date): Promise<Timeline> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { key: true, personalOwnerId: true } })
  const projectTasksId = await ensureProjectTasks(projectId)
  const boards = projectTasksFirst(await prisma.board.findMany({
    where: { projectId, ...(boardId ? { id: boardId } : { archivedAt: null }) },
    orderBy: { createdAt: 'asc' },
    include: { sprints: { where: { startDate: { lt: range.to }, finishDate: { gte: range.from } }, orderBy: { number: 'asc' } } },
  }))
  const boardIds = boards.map(b => b.id)
  const [rows, backlog, epicRows, milestones, routines] = await Promise.all([
    prisma.task.findMany({ where: { projectId, boardId: { in: boardIds }, archived: false, isEpic: false, column: { not: null } }, select: TASK_SELECT }),
    prisma.task.groupBy({ by: ['boardId'], where: { boardId: { in: boardIds }, archived: false, column: null, isEpic: false }, _count: { _all: true } }),
    prisma.task.findMany({
      where: { projectId, isEpic: true, archived: false },
      select: { ...TASK_SELECT, epicTasks: { where: { archived: false }, select: { id: true, boardId: true, planStart: true, planFinish: true } } },
    }),
    prisma.milestone.findMany({ where: { projectId, date: { gte: range.from, lt: range.to } }, orderBy: { date: 'asc' }, include: { epics: { select: { id: true } } } }),
    prisma.routine.findMany({ where: { projectId, enabled: true }, select: { id: true, title: true, boardId: true, scheduleAt: true, scheduleRule: true, scheduleTimezone: true } }),
  ])

  const runs = await readRunSlices(project.personalOwnerId ? { ownerType: 'user', ownerId: project.personalOwnerId } : { ownerType: 'project', ownerId: projectId }, new Set(rows.map(t => t.id)), range, now)
  const worked = new Set(runs.slices.map(s => s.taskId))
  const key = (n: number) => `${project.key}-${n}`
  const shape = (t: (typeof rows)[number]) => ({
    id: t.id, key: key(t.number), title: t.title, boardId: t.boardId, column: t.column, status: t.status, priority: t.priority,
    runState: t.runState, needsYou: needsYou(t), assignedAgent: t.assignedAgent, planStart: t.planStart, planFinish: t.planFinish,
    startAt: t.scheduleNextDueAt, roundAt: t.roundAt, routineId: t.routineId,
  })
  const tasks = rows
    .filter(t => planOverlaps(t.planStart, t.planFinish, range) || inRange(t.scheduleNextDueAt, range) || inRange(t.roundAt, range) || worked.has(t.id))
    .map(t => ({ ...shape(t), epicId: t.epicId }))

  const inScope = new Set(boardIds)
  const epics = epicRows
    .filter(e => (e.boardId !== null && inScope.has(e.boardId)) || e.epicTasks.some(t => t.boardId !== null && inScope.has(t.boardId)))
    .map(e => ({ ...shape(e), milestoneId: e.milestoneId, span: epicSpan(e, e.epicTasks), taskIds: e.epicTasks.map(t => t.id) }))
    .filter(e => e.span !== null && planOverlaps(e.span.start, e.span.finish, range))

  const backlogOf = new Map(backlog.map(b => [b.boardId, b._count._all]))
  return {
    from: range.from,
    to: range.to,
    capped: range.capped ?? false,
    boards: boards.map(b => ({ id: b.id, name: b.name, kind: b.kind, backlogCount: backlogOf.get(b.id) ?? 0, sprints: b.sprints.map(s => sprintView(s, now)) })),
    tasks,
    epics,
    milestones: milestones.map(m => ({ id: m.id, name: m.name, date: m.date, epicIds: m.epics.map(e => e.id) })),
    routineRounds: routines.flatMap(r => {
      const onBoard = r.boardId ?? projectTasksId
      const schedule = routineScheduleOf(r)
      if (!inScope.has(onBoard) || !schedule) return []
      const { times, more } = roundsIn(schedule, range)
      return times.length ? [{ routineId: r.id, title: r.title, boardId: onBoard, at: times, more }] : []
    }),
    runs,
  }
}

async function readRunSlices(owner: { ownerType: 'project' | 'user'; ownerId: string }, taskIds: Set<string>, range: Range, now: Date): Promise<Timeline['runs']> {
  if (taskIds.size === 0) return { slices: [], unavailable: null, truncated: false }
  try {
    const siteId = await resolveExecutionSiteId(owner)
    // A site that does not know `taskIds` (below 16.1) refuses the field: ask it the old way, for everyone's runs.
    const ids = [...taskIds].slice(0, RUN_TASK_IDS_MAX)
    const page = await listRunsPage(siteId, { limit: RUN_PAGE, before: pageCursorAt(range.to), taskIds: ids })
    const oldest = page.runs.at(-1)
    const truncated = page.nextBefore !== null && !!oldest && new Date(oldest.startedAt ?? oldest.createdAt) > range.from
    return { slices: runSlices(page.runs, taskIds, range, now), unavailable: null, truncated: truncated || ids.length < taskIds.size }
  } catch (err) {
    logger.warn(`timeline runs: ${err instanceof Error ? err.message : String(err)}`)
    const unavailable = err instanceof SiteUnreachableError || err instanceof HttpError ? err.message : 'The runs could not be read from the Execution Site'
    return { slices: [], unavailable, truncated: false }
  }
}
