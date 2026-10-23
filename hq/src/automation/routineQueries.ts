/**
 * Reading routines (spec §3): a project's list, and one routine — its
 * template, schedule, person, next round, and its rounds newest first, each
 * with its state and how long its run took. Anyone who can see the project can
 * read them.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetProjectRoutines, GetRoutine } from 'wasp/server/operations'
import { requireProjectMember } from '../projects/membership'
import { entitledPeople, usernames } from '../projects/onBehalfOfOperations'
import { LAST_ROUNDS, type RoutineDetail, type RoutineSummary } from '../shared/routineTypes'
import { personMayWorkInProject } from '../projects/taskOnBehalfOf'
import { isProjectAdmin } from './routines'
import { labelsOf } from './routineTemplate'
import { roundState } from './roundState'
import { roundRunTimes } from './roundRunTimes'
import { ROUNDS_NEWEST_FIRST, summarise } from './routineSummary'
import { isYourSpace } from '../projects/personalProject'

/** The most rounds one read returns; Older rounds asks for more, up to this. */
const MAX_ROUNDS = 200

export const getProjectRoutines: GetProjectRoutines<{ projectId: string }, RoutineSummary[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(args.projectId, context.user.id, "Reading this project's routines")
  const routines = await prisma.routine.findMany({ where: { projectId: args.projectId }, orderBy: { createdAt: 'asc' } })
  return summarise(routines, context.user.id)
}

export const getRoutine: GetRoutine<{ routineId: string; rounds?: number }, RoutineDetail> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const routine = await prisma.routine.findUnique({
    where: { id: args.routineId },
    include: { project: { select: { key: true, personalOwnerId: true, personalSpace: true } } },
  })
  if (!routine) throw new HttpError(404, 'Routine not found')
  await requireProjectMember(routine.projectId, context.user.id, 'Reading this routine')
  const now = new Date()
  const [summary] = await summarise([routine], context.user.id, now)
  const limit = Math.min(Math.max(args.rounds ?? LAST_ROUNDS, 1), MAX_ROUNDS)
  const read = await prisma.task.findMany({
    where: { routineId: routine.id },
    orderBy: [...ROUNDS_NEWEST_FIRST],
    take: limit + 1,
    select: {
      id: true, number: true, title: true, status: true, column: true, runState: true, runStateReason: true,
      archived: true, roundAt: true, createdAt: true,
    },
  })
  const rounds = read.slice(0, limit)
  const took = await roundRunTimes(rounds.map(t => t.id))
  const admin = await isProjectAdmin(routine.projectId, context.user.id)
  const creator = routine.createdByAgentId
    ? (await prisma.agent.findUnique({ where: { id: routine.createdByAgentId }, select: { name: true } }))?.name ?? 'an agent'
    : null
  const creatorName = routine.createdByUserId ? (await usernames([routine.createdByUserId])).get(routine.createdByUserId) ?? null : null
  return {
    ...summary,
    projectId: routine.projectId,
    projectKey: routine.project.key,
    isPersonal: isYourSpace(routine.project),
    description: routine.description,
    priority: routine.priority,
    labels: labelsOf(routine.labels),
    assignedAgentId: routine.assignedAgentId,
    modelChoice: routine.modelChoice,
    boardId: routine.boardId,
    column: routine.column,
    scheduleAt: routine.scheduleAt.toISOString(),
    createdBy: creator ? `${creator}, when ${creatorName ?? 'a person'} asked` : creatorName ?? 'unknown',
    onBehalfOfHasAccess: await personMayWorkInProject(routine.projectId, routine.onBehalfOfUserId),
    isProjectAdmin: admin,
    candidates: admin ? await entitledPeople(routine.projectId) : [],
    rounds: rounds.map(t => ({
      id: t.id,
      key: `${routine.project.key}-${t.number}`,
      title: t.title,
      status: t.status,
      column: t.column,
      runState: t.runState,
      reason: t.runStateReason,
      archived: t.archived,
      roundAt: t.roundAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      waiting: !!t.roundAt && t.roundAt.getTime() > now.getTime(),
      state: roundState(t, now),
      tookMs: took.get(t.id) ?? null,
    })),
    moreRounds: read.length > limit,
  }
}
