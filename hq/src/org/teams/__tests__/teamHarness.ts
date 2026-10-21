/**
 * Shared by the team membership integration tests. The vi.mock blocks stay in
 * each test file: vitest hoists them per file.
 */
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject } from '../../../test/factories'
import { createTeam } from '../teamActions'

export const as = (user: { id: string } | null) => ({ user }) as any
export const WAIT = { kind: 'wait' } as const

/** A private project with its own admin, and an org admin who runs the teams and is a member there too. */
export async function setting() {
  const projectAdmin = await createUserWithRole('MEMBER')
  const orgAdmin = await createUserWithRole('ADMIN')
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.createMany({ data: [
    { projectId: project.id, userId: projectAdmin.id, role: 'ADMIN' },
    { projectId: project.id, userId: orgAdmin.id, role: 'MEMBER' },
  ] })
  return { projectAdmin, orgAdmin, project }
}

export async function makeTeam(orgAdmin: { id: string }, people: { id: string }[], agents: { id: string }[] = [], name = 'Marketing') {
  return createTeam({ name, userIds: people.map(p => p.id), agentIds: agents.map(a => a.id) }, as(orgAdmin))
}

export const rowOf = (projectId: string, userId: string) =>
  prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true, direct: true, ownRole: true } })
export const agentRowOf = (projectId: string, agentId: string) =>
  prisma.projectAgent.findUnique({ where: { projectId_agentId: { projectId, agentId } }, select: { direct: true } })
