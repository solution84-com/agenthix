/**
 * Reordering a project's routines (the Routines design keys 12, 13): the order is the project's, the same for
 * everyone, so changing it takes someone who may work in the project (adr-0102). The list given must be exactly the
 * project's routines, each once: one made or deleted meanwhile refuses the move rather than guessing where it goes.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ReorderRoutines } from 'wasp/server/operations'
import { requireMayWorkInProject } from '../projects/membership'

export type ReorderRoutinesArgs = { projectId: string; routineIds: string[] }

const MAX_ROUTINES = 500

export const ROUTINES_CHANGED = "The project's routines changed while you moved them. Look again, then move them. Nothing was changed."

export const reorderRoutines: ReorderRoutines<ReorderRoutinesArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = args?.projectId
  if (typeof projectId !== 'string' || projectId.length === 0 || projectId.length > 64) throw new HttpError(400, 'A project is needed. Nothing was changed.')
  await requireMayWorkInProject(projectId, context.user.id, "Changing the order of this project's routines")
  const ids = Array.isArray(args.routineIds) ? args.routineIds : null
  if (!ids || ids.length > MAX_ROUTINES || ids.some(id => typeof id !== 'string')) {
    throw new HttpError(400, 'Name every routine in its new order. Nothing was changed.')
  }
  const present = await prisma.routine.findMany({ where: { projectId }, select: { id: true } })
  const known = new Set(present.map(r => r.id))
  if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some(id => !known.has(id))) {
    throw new HttpError(409, ROUTINES_CHANGED)
  }
  // `projectId` in each write as well: an id is only ever moved within the project it was checked against.
  await prisma.$transaction(ids.map((id, position) => prisma.routine.updateMany({ where: { id, projectId }, data: { position } })))
}
