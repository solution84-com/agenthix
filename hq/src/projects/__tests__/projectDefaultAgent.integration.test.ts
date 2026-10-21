/**
 * A project's default agent (every screen reviewed spec §9), set by its admin
 * through updateProject: it must be one of the project's own agents, or none.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { assignAgent } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { updateProject } from '../actions'

const as = (user: { id: string }) => ({ user }) as any

async function projectWithAdmin() {
  const project = await createProject()
  const admin = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })
  return { project, admin }
}
const defaultOf = async (projectId: string) =>
  (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).defaultAgentId

describe("a project's default agent @SC-639", () => {
  it("lets a project admin choose one of the project's agents", async () => {
    const { project, admin } = await projectWithAdmin()
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)

    await updateProject({ projectId: project.id, defaultAgentId: agent.id }, as(admin))

    expect(await defaultOf(project.id)).toBe(agent.id)
  })

  it('refuses an agent that is not in the project, leaving the default as it was', async () => {
    const { project, admin } = await projectWithAdmin()
    const outsider = await createAgent()

    await expect(updateProject({ projectId: project.id, defaultAgentId: outsider.id }, as(admin))).rejects.toMatchObject({ statusCode: 400 })

    expect(await defaultOf(project.id)).toBeNull()
  })

  it('lets a project admin clear it', async () => {
    const { project, admin } = await projectWithAdmin()
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)
    await updateProject({ projectId: project.id, defaultAgentId: agent.id }, as(admin))

    await updateProject({ projectId: project.id, defaultAgentId: null }, as(admin))

    expect(await defaultOf(project.id)).toBeNull()
  })

  it('refuses a member who is not an admin', async () => {
    const { project } = await projectWithAdmin()
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)

    await expect(updateProject({ projectId: project.id, defaultAgentId: agent.id }, as(member))).rejects.toMatchObject({ statusCode: 403 })
  })
})
