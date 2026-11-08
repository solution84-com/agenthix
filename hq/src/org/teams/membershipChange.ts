/**
 * One change to where project memberships come from — a team added to or
 * removed from a project, its role there changed, or its people or agents
 * changed — carried through to every project row it touches, in one
 * transaction (adr-0103).
 *
 * Inside the transaction, after the change: each affected person's and agent's
 * row is rewritten (`writeThrough.ts`); a project that had an admin must still
 * have one; the open tasks of agents who leave go where the caller chose, and so
 * does the project's default agent when it leaves. Any refusal rolls the whole
 * change back. After it commits, the people who left are handled as when a
 * person is removed (`openTaskHandover.ts`): their open tasks go where the
 * caller chose, and each site holding their home there is told. Someone who
 * stays but becomes a Viewer has their open tasks left waiting, as a demotion
 * to Viewer does.
 */
import { HttpError, prisma } from 'wasp/server'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../../sites/heldInstructions'
import { sitesForMemberInProject } from '../../sites/membershipEnding'
import { handOverOpenTasks } from '../../projects/openTaskHandover'
import type { OpenTasksDestination } from '../../projects/openTasksDestination'
import { writeAgent, writePerson, type AgentChange, type PersonChange, type Tx } from './writeThrough'
import { closeProjectConversations, declineWaitingInProject } from '../../conversations/closing'
import { leaveRoomsNoLongerAllowed } from '../../server/roomAccess'

/** What happens to the work of those who leave a project. */
export type LeavingChoice = {
  /** The open tasks done on the leaving people's behalf: another person who works here, or left waiting. */
  openTasks: OpenTasksDestination
  /** The leaving agents' open tasks and routines: another agent that stays, or null for none. */
  agentOpenTasksTo: string | null
  /** When the project's default agent leaves: another agent that stays, or null. Required then. */
  newDefaultAgentId?: string | null
}

/** Where nobody was asked (a team's own people or agents changed): tasks wait, agents' tasks have none. */
const UNASKED: LeavingChoice = { openTasks: { kind: 'wait' }, agentOpenTasksTo: null, newDefaultAgentId: null }

export type ProjectOutcome = { projectId: string; people: PersonChange[]; agents: AgentChange[] }

export async function changeMemberships(args: {
  projectIds: string[]
  /** Everyone whose row in those projects the change may touch. */
  userIds: string[]
  agentIds: string[]
  change: (tx: Tx) => Promise<void>
  /** Per project; a project left out is treated as unasked. */
  choices?: Map<string, LeavingChoice>
  actorId: string
}): Promise<ProjectOutcome[]> {
  const projectIds = [...new Set(args.projectIds)]
  const userIds = [...new Set(args.userIds)]
  const agentIds = [...new Set(args.agentIds)]
  const sites = await sitesOfCurrentMembers(projectIds, userIds)

  const outcomes = await prisma.$transaction(async (tx) => {
    await args.change(tx)
    const out: ProjectOutcome[] = []
    for (const projectId of projectIds) {
      const choice = args.choices?.get(projectId)
      out.push(await rewriteProject(tx, projectId, userIds, agentIds, choice, sites))
    }
    return out
  }, { timeout: 30_000 })

  await deliverHeldInstructionsTo([...new Set([...sites.values()].flat())])
  // Anyone a team change took out of a project leaves its rooms.
  void leaveRoomsNoLongerAllowed(userIds)
  for (const outcome of outcomes) await declineWaitingInProject(outcome.projectId)
  for (const outcome of outcomes) {
    const choice = args.choices?.get(outcome.projectId) ?? UNASKED
    for (const p of outcome.people) {
      if (p.before !== null && p.after === null) {
        await handOverOpenTasks({ projectId: outcome.projectId, fromUserId: p.userId, destination: choice.openTasks, actorId: args.actorId })
      } else if (p.before !== null && p.before !== 'VIEWER' && p.after === 'VIEWER') {
        await handOverOpenTasks({ projectId: outcome.projectId, fromUserId: p.userId, destination: { kind: 'wait' }, actorId: args.actorId })
      }
    }
  }
  return outcomes
}

/** Read before the change, which removes the rows these lookups start from (`membershipEnding.ts`). */
async function sitesOfCurrentMembers(projectIds: string[], userIds: string[]): Promise<Map<string, string[]>> {
  const current = await prisma.projectMember.findMany({
    where: { projectId: { in: projectIds }, userId: { in: userIds } },
    select: { projectId: true, userId: true },
  })
  const sites = new Map<string, string[]>()
  for (const m of current) sites.set(`${m.projectId}:${m.userId}`, await sitesForMemberInProject(m.projectId, m.userId))
  return sites
}

async function rewriteProject(
  tx: Tx,
  projectId: string,
  userIds: string[],
  agentIds: string[],
  asked: LeavingChoice | undefined,
  sites: Map<string, string[]>,
): Promise<ProjectOutcome> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, defaultAgentId: true } })
  const adminsBefore = await tx.projectMember.count({ where: { projectId, role: 'ADMIN' } })
  const people: PersonChange[] = []
  for (const userId of userIds) people.push(await writePerson(tx, projectId, userId))
  const agents: AgentChange[] = []
  for (const agentId of agentIds) agents.push(await writeAgent(tx, projectId, agentId))

  if (adminsBefore > 0 && (await tx.projectMember.count({ where: { projectId, role: 'ADMIN' } })) === 0) {
    throw new HttpError(400, `This would leave ${project.name} without an admin. Appoint another admin there first.`)
  }
  const choice = asked ?? UNASKED
  const leavingPeople = people.filter(p => p.before !== null && p.after === null).map(p => p.userId)
  if (leavingPeople.length > 0) await checkPersonDestination(tx, projectId, choice.openTasks, leavingPeople)
  const leavingAgents = agents.filter(a => a.before && !a.after).map(a => a.agentId)
  if (leavingAgents.length > 0) await giveAgentsWorkAway(tx, projectId, project.defaultAgentId, leavingAgents, choice, asked !== undefined)

  const held = leavingPeople.flatMap(userId => heldInstructionRows(sites.get(`${projectId}:${userId}`) ?? [], {
    method: MEMBERSHIP_METHODS.memberLeftProject, params: { userId, projectId },
  }))
  if (held.length > 0) await tx.heldSiteInstruction.createMany({ data: held })
  if (leavingPeople.length > 0) await closeProjectConversations(tx, projectId, 'LEFT_PROJECT', leavingPeople)
  return { projectId, people, agents }
}

async function checkPersonDestination(tx: Tx, projectId: string, destination: OpenTasksDestination, leaving: string[]): Promise<void> {
  if (destination.kind === 'wait') return
  if (leaving.includes(destination.userId)) throw new HttpError(400, 'Their open tasks must go to someone who stays')
  const [row, person] = await Promise.all([
    tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: destination.userId } }, select: { role: true } }),
    tx.user.findUnique({ where: { id: destination.userId }, select: { deactivatedAt: true } }),
  ])
  if (!row || row.role === 'VIEWER' || !person || person.deactivatedAt !== null) {
    throw new HttpError(400, 'Their open tasks can only go to someone who works in this project, not a Viewer')
  }
}

/** As removing an agent does (`agentAssignment.ts`): done tasks keep it, a run in progress finishes. */
async function giveAgentsWorkAway(
  tx: Tx,
  projectId: string,
  defaultAgentId: string | null,
  leaving: string[],
  choice: LeavingChoice,
  wasAsked: boolean,
): Promise<void> {
  const stays = async (agentId: string | null, what: string) => {
    if (agentId === null) return
    const row = await tx.projectAgent.findUnique({ where: { projectId_agentId: { projectId, agentId } } })
    if (!row || leaving.includes(agentId)) throw new HttpError(400, `${what} can only be an agent that stays in this project`)
  }
  await stays(choice.agentOpenTasksTo, 'Where their open tasks go')
  if (defaultAgentId !== null && leaving.includes(defaultAgentId)) {
    if (wasAsked && choice.newDefaultAgentId === undefined) {
      throw new HttpError(400, "The project's default agent is leaving: say which agent here becomes the default, or none")
    }
    const next = choice.newDefaultAgentId ?? null
    await stays(next, 'The new default agent')
    await tx.project.update({ where: { id: projectId }, data: { defaultAgentId: next } })
  }
  await tx.task.updateMany({
    where: { projectId, assignedAgentId: { in: leaving }, state: { not: 'DONE' } },
    data: { assignedAgentId: choice.agentOpenTasksTo },
  })
  await tx.routine.updateMany({ where: { projectId, agentId: { in: leaving } }, data: { agentId: choice.agentOpenTasksTo } })
}
