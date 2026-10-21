/**
 * Every routine in the projects a person is a member of, and in their own Chat,
 * for the Projects screen's Routines view (every screen reviewed spec §3).
 * Membership is the gate, as for the Boards view: an organisation admin sees
 * the same, not every project's.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetRoutinesAcrossProjects } from 'wasp/server/operations'
import { entitledProjectsFilter } from '../projects/membership'
import type { RoutineAcross } from '../shared/routineTypes'
import { summarise } from './routineSummary'

export async function readRoutinesAcrossProjects(userId: string): Promise<RoutineAcross[]> {
  const projects = await prisma.project.findMany({
    where: entitledProjectsFilter(userId),
    select: { id: true, key: true, name: true, personalOwnerId: true },
  })
  const placeOf = new Map(projects.map(p => [p.id, p.personalOwnerId
    ? { id: p.id, key: null, name: 'Chat' }
    : { id: p.id, key: p.key, name: p.name }]))
  const routines = await prisma.routine.findMany({
    where: { projectId: { in: projects.map(p => p.id) } },
    orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
  })
  const summaries = await summarise(routines, userId)
  return summaries.map((s, i) => ({ ...s, project: placeOf.get(routines[i].projectId)! }))
}

export const getRoutinesAcrossProjects: GetRoutinesAcrossProjects<void, RoutineAcross[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return readRoutinesAcrossProjects(context.user.id)
}
