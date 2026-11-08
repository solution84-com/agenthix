/**
 * Which agents a project uses (adr-0062: an assignment is availability and
 * grants nothing). No auth here — the actions decide who may assign and remove.
 *
 * An agent may also be here through one of the project's teams (adr-0103).
 * These change its assignment in its own right: one here only through a team
 * is changed through the team, and one here both ways that is removed stays,
 * through the team.
 */
import { HttpError, prisma } from 'wasp/server'
import { teamNamesThrough, writeAgent } from '../org/teams/writeThrough'
import { taskLeadChanged } from '../conversations/taskThread/lifecycle'

/** The first agent a project gets becomes its default, so a conversation there has an agent to start with. */
export async function addAgentToProject(params: { projectId: string; agentId: string }) {
  return prisma.$transaction(async (tx) => {
    await writeAgent(tx, params.projectId, params.agentId, true)
    return tx.projectAgent.findUniqueOrThrow({ where: { projectId_agentId: { projectId: params.projectId, agentId: params.agentId } } })
  })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** `to` must be another agent assigned to the project, or null for none. */
async function requireOtherAgentHere(tx: Tx, projectId: string, agentId: string, to: string | null, what: string) {
  if (to === null) return
  if (to === agentId) throw new HttpError(400, `${what} cannot be the agent being removed`)
  const target = await tx.projectAgent.findUnique({ where: { projectId_agentId: { projectId, agentId: to } } })
  if (!target) throw new HttpError(400, `${what} can only be another agent assigned to this project`)
}

/**
 * Removes an agent from a project, and in the same transaction gives its open
 * tasks there — every one not done — and its routines there to `openTasksTo`:
 * another agent assigned to the project, or null for none, when they wait until
 * someone assigns them (every screen reviewed spec §3). There is no default:
 * the caller states the choice. Done tasks keep the agent that did them. A run
 * in progress is not stopped; it finishes, and any later run is the new agent's.
 *
 * When the agent is the project's default, `newDefaultAgentId` is required too
 * (another agent here, or null for none); otherwise it is ignored.
 */
export async function removeAgentFromProject(params: {
  projectId: string; agentId: string; openTasksTo: string | null; newDefaultAgentId?: string | null
}) {
  const { projectId, agentId, openTasksTo, newDefaultAgentId } = params
  let handedOver: string[] = []
  const outcome = await prisma.$transaction(async (tx) => {
    const row = await tx.projectAgent.findUnique({ where: { projectId_agentId: { projectId, agentId } }, select: { direct: true } })
    const teams = await teamNamesThrough(tx, projectId, { agentId })
    if (row && !row.direct) {
      throw new HttpError(400, `It is here through ${teams.join(', ') || 'a team'}, so it is removed from the team`)
    }
    if (row && teams.length > 0) {
      // It stays, through its teams: nothing of its work moves.
      await writeAgent(tx, projectId, agentId, false)
      return { count: 0, movedTasks: 0, movedRoutines: 0 }
    }
    await requireOtherAgentHere(tx, projectId, agentId, openTasksTo, 'Where its open tasks go')
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { defaultAgentId: true } })
    const isDefault = project?.defaultAgentId === agentId
    if (isDefault) {
      if (newDefaultAgentId === undefined) {
        throw new HttpError(400, "It is the project's default agent: say which agent here becomes the default, or none")
      }
      await requireOtherAgentHere(tx, projectId, agentId, newDefaultAgentId, 'The new default agent')
      await tx.project.update({ where: { id: projectId }, data: { defaultAgentId: newDefaultAgentId } })
    }
    handedOver = (await tx.task.findMany({
      where: { projectId, assignedAgentId: agentId, state: { not: 'DONE' } },
      select: { id: true },
    })).map(t => t.id)
    const moved = await tx.task.updateMany({
      where: { projectId, assignedAgentId: agentId, state: { not: 'DONE' } },
      data: { assignedAgentId: openTasksTo },
    })
    const movedRoutines = await tx.routine.updateMany({
      where: { projectId, agentId },
      data: { agentId: openTasksTo },
    })
    const removed = await tx.projectAgent.deleteMany({ where: { projectId, agentId } })
    return { count: removed.count, movedTasks: moved.count, movedRoutines: movedRoutines.count }
  })
  // Each handed-over task's thread carries on with its new agent, or waits for one (taskThread/lifecycle.ts).
  await taskLeadChanged(handedOver, agentId, openTasksTo)
  return outcome
}
