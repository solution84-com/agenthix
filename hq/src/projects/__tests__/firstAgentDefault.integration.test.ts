/**
 * The first agent added to a project becomes its default (every screen reviewed
 * spec §9), against the real test database, through the action a project admin
 * uses.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { addAgentToProject } from '../actions'

const as = (user: { id: string }) => ({ user }) as any

async function adminOf(project: { id: string }) {
  const admin = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })
  return admin
}
const defaultOf = async (projectId: string) =>
  (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).defaultAgentId

describe('the first agent added becomes the default @SC-500', () => {
  it('makes the first agent of a project with no default its default', async () => {
    const project = await createProject()
    const admin = await adminOf(project)
    const agent = await createAgent()

    await addAgentToProject({ projectId: project.id, agentId: agent.id }, as(admin))

    expect(await defaultOf(project.id)).toBe(agent.id)
  })

  it('leaves the default alone when the project already has one', async () => {
    const project = await createProject()
    const admin = await adminOf(project)
    const first = await createAgent()
    const second = await createAgent()
    await addAgentToProject({ projectId: project.id, agentId: first.id }, as(admin))

    await addAgentToProject({ projectId: project.id, agentId: second.id }, as(admin))

    expect(await defaultOf(project.id)).toBe(first.id)
  })

  it('leaves a default the admin chose before any agent was added', async () => {
    const chosen = await createAgent()
    const project = await createProject({ defaultAgentId: chosen.id })
    const admin = await adminOf(project)
    const agent = await createAgent()

    await addAgentToProject({ projectId: project.id, agentId: agent.id }, as(admin))

    expect(await defaultOf(project.id)).toBe(chosen.id)
  })

  it('changes nothing when the add is refused', async () => {
    const project = await createProject()
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    const agent = await createAgent()

    await expect(addAgentToProject({ projectId: project.id, agentId: agent.id }, as(member))).rejects.toMatchObject({ statusCode: 403 })

    expect(await defaultOf(project.id)).toBeNull()
  })
})
