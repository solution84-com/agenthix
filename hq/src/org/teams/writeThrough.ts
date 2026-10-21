/**
 * A team joins a project as one member, written through to its members
 * (adr-0103). The project's teams (ProjectTeam) and each team's people and
 * agents (TeamPerson, TeamAgent) are where a membership comes from; the
 * ProjectMember and ProjectAgent rows are what every access check reads. These
 * functions bring one person's or one agent's row in a project back in step
 * with where it comes from, after the caller changed that.
 *
 * Someone who has left the organisation is never written in through a team:
 * leaving ends every membership (adr-0100), and a team cannot give it back.
 */
import type { Prisma } from '@prisma/client'
import { ownRoleOf, personRow, type ProjectRole } from './teamRoles'

export type Tx = Prisma.TransactionClient

export type PersonChange = { userId: string; before: ProjectRole | null; after: ProjectRole | null }
export type AgentChange = { agentId: string; before: boolean; after: boolean }

/** The roles of the project's teams this person is in; none for someone who has left. */
async function teamRolesOf(tx: Tx, projectId: string, userId: string): Promise<ProjectRole[]> {
  const person = await tx.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } })
  if (!person || person.deactivatedAt !== null) return []
  const rows = await tx.projectTeam.findMany({
    where: { projectId, team: { people: { some: { userId } } } },
    select: { role: true },
  })
  return rows.map(r => r.role)
}

/**
 * Rewrites one person's row in a project from their own membership and their
 * teams there. `own` changes their own membership first: a role to be a member
 * in their own right, or null to stop being one; left out, it stays as it is.
 */
export async function writePerson(tx: Tx, projectId: string, userId: string, own?: ProjectRole | null): Promise<PersonChange> {
  const key = { projectId_userId: { projectId, userId } }
  const row = await tx.projectMember.findUnique({ where: key, select: { role: true, direct: true, ownRole: true } })
  const ownRole = own === undefined ? ownRoleOf(row) : own
  const next = personRow(ownRole, await teamRolesOf(tx, projectId, userId))
  const before = row?.role ?? null
  if (!next) {
    if (row) await tx.projectMember.delete({ where: key })
    return { userId, before, after: null }
  }
  if (!row) await tx.projectMember.create({ data: { projectId, userId, ...next } })
  else if (row.role !== next.role || row.direct !== next.direct || row.ownRole !== next.ownRole) {
    await tx.projectMember.update({ where: key, data: next })
  }
  return { userId, before, after: next.role }
}

/**
 * Rewrites one agent's assignment to a project from its own assignment and its
 * teams there. `direct` changes its own assignment first; left out, it stays.
 * The first agent a project gets becomes its default, however it came.
 */
export async function writeAgent(tx: Tx, projectId: string, agentId: string, direct?: boolean): Promise<AgentChange> {
  const key = { projectId_agentId: { projectId, agentId } }
  const row = await tx.projectAgent.findUnique({ where: key, select: { direct: true } })
  const own = direct ?? row?.direct ?? false
  const viaTeam = (await tx.projectTeam.count({ where: { projectId, team: { agents: { some: { agentId } } } } })) > 0
  const before = row !== null
  if (!own && !viaTeam) {
    if (row) await tx.projectAgent.delete({ where: key })
    return { agentId, before, after: false }
  }
  if (!row) {
    await tx.projectAgent.create({ data: { projectId, agentId, direct: own } })
    await tx.project.updateMany({ where: { id: projectId, defaultAgentId: null }, data: { defaultAgentId: agentId } })
  } else if (row.direct !== own) {
    await tx.projectAgent.update({ where: key, data: { direct: own } })
  }
  return { agentId, before, after: true }
}

/** The names of the project's teams this person or agent is there through, for a refusal that says which. */
export async function teamNamesThrough(
  tx: Tx,
  projectId: string,
  who: { userId: string } | { agentId: string },
): Promise<string[]> {
  const team = 'userId' in who ? { people: { some: { userId: who.userId } } } : { agents: { some: { agentId: who.agentId } } }
  const rows = await tx.projectTeam.findMany({ where: { projectId, team }, select: { team: { select: { name: true } } } })
  return rows.map(r => r.team.name)
}
