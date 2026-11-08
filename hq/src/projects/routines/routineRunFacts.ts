/**
 * `getRoutineRunFacts`: what the Routines screens read beside hq's own routine runs — each run's cost and today's runs
 * and spending, from the sites, and each routine's instructions in a line for its card — for a project's routines, one
 * routine's, or every routine the person may read across projects. Reading a project's routines needs membership, as reading the routines does (routineQueries.ts);
 * only the routines' own sessions are asked for, and only their totals come back.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetRoutineRunFacts } from 'wasp/server/operations'
import { RUN_SESSION_IDS_MAX } from '@agenthix/core'
import { entitledProjectsFilter, requireProjectMember } from '../membership'
import { readMergedRunFeed } from '../../sessions/mergedRunFeed'
import { LAST_RUNS } from '../../shared/routineTypes'
import { aboutOf, factsOf, type FactsRun, type RoutineRunFactsArgs, type RoutineRunFactsResult } from './routineRunFactsRules'

/** The most runs one routine's page asks about, as its runs list reads at most. */
const MAX_RUNS = 200
/** The most site rows one read takes: a firing is mostly one run, two after an approval. */
const FEED_LIMIT = 500

type Read = { id: string; instructions: string }
const READ = { id: true, instructions: true } as const

async function routinesOf(args: RoutineRunFactsArgs, userId: string): Promise<Read[]> {
  if (args.routineId) {
    const routine = await prisma.routine.findUnique({ where: { id: args.routineId }, select: { ...READ, projectId: true } })
    if (!routine) throw new HttpError(404, 'Routine not found')
    await requireProjectMember(routine.projectId, userId, 'Reading this routine')
    return [routine]
  }
  if (args.projectId) {
    await requireProjectMember(args.projectId, userId, "Reading this project's routines")
    return prisma.routine.findMany({ where: { projectId: args.projectId }, select: READ })
  }
  return prisma.routine.findMany({ where: { project: entitledProjectsFilter(userId) }, select: READ })
}

const RUN_FIELDS = { id: true, sessionId: true, state: true, startedAt: true } as const

export async function readRoutineRunFacts(args: RoutineRunFactsArgs, userId: string): Promise<RoutineRunFactsResult> {
  const todayFrom = new Date(args.todayFrom)
  if (Number.isNaN(todayFrom.getTime())) throw new HttpError(400, 'todayFrom must be a time. Nothing was read.')
  const routines = await routinesOf(args, userId)
  const ids = routines.map(r => r.id)
  const about = Object.fromEntries(routines.map(r => [r.id, aboutOf(r.instructions)]))
  if (ids.length === 0) return { cost: {}, today: { ran: 0, running: 0, spent: 0 }, about, unanswered: [] }
  const newest = args.routineId ? Math.min(Math.max(Math.floor(args.runs ?? LAST_RUNS), 1), MAX_RUNS) : LAST_RUNS
  const [recent, today] = await Promise.all([
    // The newest of each routine, read per routine so a busy one never crowds out the others.
    Promise.all(ids.map(id => prisma.routineRun.findMany({ where: { routineId: id }, orderBy: { createdAt: 'desc' }, take: newest, select: RUN_FIELDS }))),
    prisma.routineRun.findMany({
      where: { routineId: { in: ids }, OR: [{ startedAt: { gte: todayFrom } }, { state: { in: ['STARTING', 'RUNNING'] } }] },
      select: RUN_FIELDS,
    }),
  ])
  const runs: FactsRun[] = [...recent.flat(), ...today]
  const sessionIds = [...new Set(runs.flatMap(r => (r.sessionId ? [r.sessionId] : [])))].slice(0, RUN_SESSION_IDS_MAX)
  if (sessionIds.length === 0) return { ...factsOf(runs, [], todayFrom), about, unanswered: [] }
  const feed = await readMergedRunFeed({ limit: FEED_LIMIT, filter: { sessionIds } })
  return { ...factsOf(runs, feed.runs, todayFrom), about, unanswered: feed.unanswered }
}

export const getRoutineRunFacts: GetRoutineRunFacts<RoutineRunFactsArgs, RoutineRunFactsResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  return readRoutineRunFacts(args ?? { todayFrom: '' }, context.user.id)
}
