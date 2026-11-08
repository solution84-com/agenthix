/**
 * Reading routines (adr-0177): a project's list, one routine with its runs, and the summary both share. Anyone who
 * can see the project can read them; whether the reader may change one is whether they may work in it (N6).
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma, Routine, RoutineRun } from '@prisma/client'
import type { GetProjectRoutines, GetRoutine } from 'wasp/server/operations'
import { describeSchedule, nextCronTimes, parseCron } from '@agenthix/core'
import { mayWorkInProject, requireProjectMember } from '../projects/membership'
import { usernames } from '../projects/onBehalfOfOperations'
import { isYourSpace } from '../projects/personalProject'
import { LAST_RUNS, type RoutineDetail, type RoutineRunView, type RoutineSummary } from '../shared/routineTypes'

/** A project's routines in the order its people gave them, the same for everyone (Routines design key 12). */
export const ROUTINE_ORDER = [{ position: 'asc' }, { createdAt: 'asc' }] satisfies Prisma.RoutineOrderByWithRelationInput[]

/** The most runs one read returns; Older runs asks for more, up to this. */
const MAX_RUNS = 200

function runView(r: RoutineRun, names: Map<string, string>): RoutineRunView {
  const person = (id: string) => ({ userId: id, username: names.get(id) ?? null })
  return {
    id: r.id, number: r.number, dueAt: r.dueAt?.toISOString() ?? null,
    startedBy: r.startedByUserId ? person(r.startedByUserId) : null, onBehalfOf: person(r.onBehalfOfUserId),
    state: r.state, ask: r.ask, reason: r.reason, sessionId: r.sessionId, runId: r.runId,
    startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString() ?? null,
  }
}

function peopleOf(routines: Routine[], runs: RoutineRun[]): string[] {
  return [...new Set([
    ...routines.map(r => r.onBehalfOfUserId),
    ...runs.flatMap(r => [r.onBehalfOfUserId, ...(r.startedByUserId ? [r.startedByUserId] : [])]),
  ])]
}

export async function summarise(routines: Routine[], userId: string): Promise<RoutineSummary[]> {
  if (routines.length === 0) return []
  const ids = routines.map(r => r.id)
  const [agents, runs] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: routines.flatMap(r => (r.agentId ? [r.agentId] : [])) } }, select: { id: true, name: true } }),
    // The newest LAST_RUNS of each: read per routine, so a busy one never crowds out the others.
    Promise.all(ids.map(id => prisma.routineRun.findMany({ where: { routineId: id }, orderBy: { createdAt: 'desc' }, take: LAST_RUNS }))),
  ])
  const names = await usernames(peopleOf(routines, runs.flat()))
  const agentOf = new Map(agents.map(a => [a.id, a]))
  const mayWork = new Map<string, boolean>()
  for (const projectId of new Set(routines.map(r => r.projectId))) mayWork.set(projectId, await mayWorkInProject(projectId, userId))
  return routines.map((r, i) => ({
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    agent: r.agentId ? agentOf.get(r.agentId) ?? null : null,
    cron: r.cron,
    timezone: r.timezone,
    scheduleWords: describeSchedule(r.cron, r.timezone),
    enabled: r.enabled,
    pausedReason: r.pausedReason,
    nextDueAt: r.enabled ? r.nextDueAt?.toISOString() ?? null : null,
    onBehalfOf: { userId: r.onBehalfOfUserId, username: names.get(r.onBehalfOfUserId) ?? null },
    modelChoice: r.modelChoice,
    canChange: mayWork.get(r.projectId) ?? false,
    lastRuns: runs[i].map(run => runView(run, names)),
  }))
}

export const getProjectRoutines: GetProjectRoutines<{ projectId: string }, RoutineSummary[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's routines")
  const routines = await prisma.routine.findMany({ where: { projectId: args.projectId }, orderBy: ROUTINE_ORDER })
  return summarise(routines, context.user.id)
}

export async function readRoutine(routineId: string, userId: string, runs: number = LAST_RUNS, now: Date = new Date()): Promise<RoutineDetail> {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    include: { project: { select: { key: true, personalOwnerId: true, personalSpace: true } } },
  })
  if (!routine) throw new HttpError(404, 'Routine not found')
  await requireProjectMember(routine.projectId, userId, 'Reading this routine')
  const limit = Math.min(Math.max(Math.floor(runs), 1), MAX_RUNS)
  const [[summary], read] = await Promise.all([
    summarise([routine], userId),
    prisma.routineRun.findMany({ where: { routineId }, orderBy: { createdAt: 'desc' }, take: limit + 1 }),
  ])
  const names = await usernames(peopleOf([routine], read))
  const parsed = parseCron(routine.cron)
  const creator = routine.createdByAgentId
    ? (await prisma.agent.findUnique({ where: { id: routine.createdByAgentId }, select: { name: true } }))?.name ?? 'an agent'
    : null
  const creatorName = routine.createdByUserId ? (await usernames([routine.createdByUserId])).get(routine.createdByUserId) ?? null : null
  return {
    ...summary,
    projectKey: routine.project.key,
    isPersonal: isYourSpace(routine.project),
    instructions: routine.instructions,
    nextTimes: parsed.ok ? nextCronTimes(parsed.rule, routine.timezone, now, 3).map(d => d.toISOString()) : [],
    createdBy: creator ? `${creator}, when ${creatorName ?? 'a person'} asked` : creatorName ?? 'unknown',
    runs: read.slice(0, limit).map(r => runView(r, names)),
    moreRuns: read.length > limit,
  }
}

export const getRoutine: GetRoutine<{ routineId: string; runs?: number }, RoutineDetail> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  return readRoutine(args.routineId, context.user.id, args.runs)
}
