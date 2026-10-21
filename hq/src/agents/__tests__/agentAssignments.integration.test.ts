/**
 * Organisation › Agents (every screen reviewed spec §3): an organisation admin
 * assigns an agent to any project — a project's admins still assign to theirs —
 * and lists where an agent is assigned, with each project's narrowing. A
 * person's own space is never theirs to assign into, and is never named.
 * Against the real test database.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { addAgentToProject } from '../../projects/actions'
import { getAgentAssignments } from '../agentAssignments'

const as = (user: { id: string }) => ({ user, entities: {} }) as any
const assigned = async (projectId: string, agentId: string) =>
  (await prisma.projectAgent.count({ where: { projectId, agentId } })) === 1

describe('assigning an agent to a project @SC-571', () => {
  it("lets an organisation admin assign to a private project they are not on", async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'PRIVATE' })
    const agent = await createAgent()

    await addAgentToProject({ projectId: project.id, agentId: agent.id }, as(orgAdmin))

    expect(await assigned(project.id, agent.id)).toBe(true)
  })

  it("refuses an organisation admin a person's own space", async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id, accessLevel: 'PRIVATE' })
    const agent = await createAgent()

    await expect(addAgentToProject({ projectId: personal.id, agentId: agent.id }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await assigned(personal.id, agent.id)).toBe(false)
  })

  it('refuses someone who is neither, and answers 404 for an agent that does not exist', async () => {
    const operator = await createUserWithRole('MEMBER')
    const project = await createProject()
    const agent = await createAgent()
    await expect(addAgentToProject({ projectId: project.id, agentId: agent.id }, as(operator))).rejects.toMatchObject({ statusCode: 403 })

    const orgAdmin = await createUserWithRole('ADMIN')
    await expect(addAgentToProject({ projectId: project.id, agentId: 'no-such-agent' }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("an agent's assignments, for organisation admins @SC-582", () => {
  it('lists the projects it is in that the admin is a member of, with its narrowing there', async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    const open = await createProject({ name: 'Open one' })
    const mine = await createProject({ name: 'Private, mine', accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [open, mine].map(p => ({ projectId: p.id, userId: orgAdmin.id, role: 'MEMBER' as const })) })
    await prisma.projectAgent.createMany({ data: [open, mine].map(p => ({ projectId: p.id, agentId: agent.id })) })
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: mine.id, agentId: agent.id, approval: 'immediate' } })

    const view = await getAgentAssignments({ agentId: agent.id }, as(orgAdmin))

    expect(view.assignments.map(a => a.project.name).sort()).toEqual(['Open one', 'Private, mine'])
    expect(view.assignments.find(a => a.project.id === mine.id)).toMatchObject({ narrowing: { approval: 'immediate', model: null, allowedTools: null, allowedBashPatterns: null } })
    expect(view.assignments.find(a => a.project.id === open.id)).toMatchObject({ narrowing: null })
    expect(view.privateProjects).toBe(0)
  })

  it("counts a private project the admin is not on without naming it or its narrowing, and never a person's own space", async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    const secret = await createProject({ name: 'Private one', key: 'HIDDENKEY', accessLevel: 'PRIVATE' })
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id, accessLevel: 'PRIVATE' })
    await prisma.projectAgent.createMany({ data: [secret, personal].map(p => ({ projectId: p.id, agentId: agent.id })) })
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: secret.id, agentId: agent.id, approval: 'immediate' } })

    const view = await getAgentAssignments({ agentId: agent.id }, as(orgAdmin))

    expect(view.assignments).toEqual([])
    expect(view.privateProjects).toBe(1)
    expect(view.personalSpaces).toBe(1)
    const text = JSON.stringify(view)
    expect(text).not.toContain(secret.id)
    expect(text).not.toContain('Private one')
    expect(text).not.toContain('HIDDENKEY')
  })

  it('offers for Assign only the projects the admin is a member of, never a person\'s own space', async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    const open = await createProject({ name: 'Open one' })
    const other = await createProject({ name: 'Not yet' })
    const mine = await createProject({ name: 'Private, mine', accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [other, mine].map(p => ({ projectId: p.id, userId: orgAdmin.id, role: 'MEMBER' as const })) })
    const secret = await createProject({ name: 'Private one', accessLevel: 'PRIVATE' })
    const ownSpace = await createProject({ personalOwnerId: orgAdmin.id, accessLevel: 'PRIVATE' })
    await prisma.projectAgent.create({ data: { projectId: open.id, agentId: agent.id } })

    const view = await getAgentAssignments({ agentId: agent.id }, as(orgAdmin))

    const offered = view.assignable.map(p => p.id)
    expect(offered).toEqual(expect.arrayContaining([other.id, mine.id]))
    expect(offered).not.toContain(open.id)
    expect(offered).not.toContain(secret.id)
    expect(offered).not.toContain(ownSpace.id)
  })

  it('is refused to anyone who is not an organisation admin', async () => {
    const operator = await createUserWithRole('MEMBER')
    const agent = await createAgent()
    await expect(getAgentAssignments({ agentId: agent.id }, as(operator))).rejects.toMatchObject({ statusCode: 403 })
  })
})
