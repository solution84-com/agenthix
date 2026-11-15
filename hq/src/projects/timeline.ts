/**
 * The timeline (every screen reviewed spec §3, adr-0098): for a project and a
 * date range — the tasks with their plans, start times and the slices of work
 * their runs did; epics with their span; milestones. A lane per task type
 * (adr-0176: a task is on no board), the project's sprints in the first; an epic
 * is drawn in the first lane holding one of its tasks. Backlog is not on it: it
 * has no time yet, so each lane carries its Backlog count instead.
 *
 * Runs are the site's, read the way the run feed reads them: one `run.listPage`
 * from the site holding the project's storage, starting at the range's end and
 * asking for the shown tasks' runs only, so a timeline costs one round trip,
 * never one per task, and the rest of the site's history cannot crowd it out.
 */
import { HttpError, prisma } from 'wasp/server'
import { RUN_TASK_IDS_MAX } from '@agenthix/core'
import type { TaskPriority, TaskRunState, TaskState, TaskTypeKind } from '@prisma/client'
import { requireProjectVisible } from './resourceEntitlement'
import { ensureBuiltInTaskTypes } from './taskTypes'
import { epicSpan } from './planSpan'
import { placeStorageOf } from './personalProject'
import { needsYou } from './needsYou'
import type { SprintView } from '@agenthix/core'
import { sprintView } from './boardReads'
import { inRange, knownRange, pageCursorAt, planOverlaps, runSlices, timelineRange, type Range, type RunSlice } from './timelineRange'
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
  /** Its type's lane; an epic's, the first lane holding one of its tasks. */
  laneId: string | null
  state: TaskState
  priority: TaskPriority
  runState: TaskRunState
  needsYou: boolean
  assignedAgent: { id: string; name: string; handle: string } | null
  epicId: string | null
  /** Plan: the bar. */
  planStart: Date | null
  planFinish: Date | null
  /** Schedule: ▶ — its start time. */
  startAt: Date | null
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
  /** A lane per task type but Epic, in the project's order of types. */
  lanes: Array<{ id: string; name: string; kind: TaskTypeKind; backlogCount: number; sprints: SprintView[] }>
  tasks: TimelineTask[]
  epics: TimelineEpic[]
  milestones: Array<{ id: string; name: string; date: Date; epicIds: string[] }>
  /** `unavailable` says why runs are missing (the site could not be asked), so none is never read as no work. */
  runs: { slices: RunSlice[]; unavailable: string | null; truncated: boolean }
}

const TASK_SELECT = {
  id: true, number: true, title: true, typeId: true, state: true, priority: true,
  runState: true, runStateReason: true, assignedAgentId: true, epicId: true, milestoneId: true,
  planStart: true, planFinish: true, scheduleNextDueAt: true,
  assignedAgent: { select: { id: true, name: true, handle: true } },
} as const

export const getTimeline = async (
  { projectId, from, to }: { projectId: string; from?: string; to?: string },
  context: { user?: { id: string } | null },
): Promise<Timeline> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectVisible(projectId, context.user.id)
  const now = new Date()
  // Without a range the timeline covers everything known, for the chart to scroll across.
  const range = from && to ? { ...timelineRange(from, to), capped: false } : await knownProjectRange(projectId, now)
  return readTimeline(projectId, range, now)
}

async function knownProjectRange(projectId: string, now: Date) {
  const [tasks, worked, sprints, milestones] = await Promise.all([
    prisma.task.aggregate({
      where: { projectId, archived: false },
      _min: { planStart: true, planFinish: true, scheduleNextDueAt: true },
      _max: { planStart: true, planFinish: true, scheduleNextDueAt: true },
    }),
    // The runs are the site's; a task that was worked is the nearest thing hq knows to when its runs began and ended.
    prisma.task.aggregate({
      where: { projectId, archived: false, lastWorkedAt: { not: null } },
      _min: { createdAt: true },
      _max: { lastWorkedAt: true },
    }),
    prisma.sprint.aggregate({
      where: { projectId },
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

export async function readTimeline(projectId: string, range: Range & { capped?: boolean }, now: Date): Promise<Timeline> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { key: true, personalOwnerId: true, personalSpace: true } })
  await ensureBuiltInTaskTypes(projectId)
  const types = await prisma.taskType.findMany({
    where: { projectId, archivedAt: null, NOT: { kind: 'EPIC' } },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, kind: true },
  })
  // A board has no sprints of its own: the project's series shows once, in the first lane.
  const sprints = await prisma.sprint.findMany({
    where: { projectId, startDate: { lt: range.to }, finishDate: { gte: range.from } }, orderBy: { number: 'asc' },
  })
  const notEpic = { projectId, archived: false, NOT: { type: { is: { kind: 'EPIC' as const } } } }
  const [rows, backlog, epicRows, milestones] = await Promise.all([
    prisma.task.findMany({ where: { ...notEpic, state: { not: 'BACKLOG' } }, select: TASK_SELECT }),
    prisma.task.groupBy({ by: ['typeId'], where: { ...notEpic, state: 'BACKLOG' }, _count: { _all: true } }),
    prisma.task.findMany({
      where: { projectId, type: { is: { kind: 'EPIC' } }, archived: false },
      select: { ...TASK_SELECT, epicTasks: { where: { archived: false }, select: { id: true, typeId: true, planStart: true, planFinish: true } } },
    }),
    prisma.milestone.findMany({ where: { projectId, date: { gte: range.from, lt: range.to } }, orderBy: { date: 'asc' }, include: { epics: { select: { id: true } } } }),
  ])
  const laneOrder = new Map(types.map((t, i) => [t.id, i]))
  const laneOfEpic = (e: (typeof epicRows)[number]): string | null => {
    const held = e.epicTasks.map(t => t.typeId).filter((id): id is string => id !== null && laneOrder.has(id))
    held.sort((a, b) => laneOrder.get(a)! - laneOrder.get(b)!)
    return held[0] ?? types[0]?.id ?? null
  }

  const runs = await readRunSlices(placeStorageOf({ id: projectId, ...project }), new Set(rows.map(t => t.id)), range, now)
  const worked = new Set(runs.slices.map(s => s.taskId))
  const key = (n: number) => `${project.key}-${n}`
  const shape = (t: (typeof rows)[number]) => ({
    id: t.id, key: key(t.number), title: t.title, laneId: t.typeId, state: t.state, priority: t.priority,
    runState: t.runState, needsYou: needsYou(t), assignedAgent: t.assignedAgent, planStart: t.planStart, planFinish: t.planFinish,
    startAt: t.scheduleNextDueAt,
  })
  const tasks = rows
    .filter(t => planOverlaps(t.planStart, t.planFinish, range) || inRange(t.scheduleNextDueAt, range) || worked.has(t.id))
    .map(t => ({ ...shape(t), epicId: t.epicId }))

  const epics = epicRows
    .map(e => ({ ...shape(e), laneId: laneOfEpic(e), milestoneId: e.milestoneId, span: epicSpan(e, e.epicTasks), taskIds: e.epicTasks.map(t => t.id) }))
    .filter(e => e.span !== null && planOverlaps(e.span.start, e.span.finish, range))

  const backlogOf = new Map(backlog.map(b => [b.typeId, b._count._all]))
  return {
    from: range.from,
    to: range.to,
    capped: range.capped ?? false,
    lanes: types.map((t, i) => ({ id: t.id, name: t.name, kind: t.kind, backlogCount: backlogOf.get(t.id) ?? 0, sprints: i === 0 ? sprints.map(sp => sprintView(sp, now)) : [] })),
    tasks,
    epics,
    milestones: milestones.map(m => ({ id: m.id, name: m.name, date: m.date, epicIds: m.epics.map(e => e.id) })),
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
