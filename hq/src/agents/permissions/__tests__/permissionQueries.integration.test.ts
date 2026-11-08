/**
 * The permissions reads (every screen reviewed spec §3) against the real test database: who may read each level,
 * what each answers, and the agent's card where it is opened.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUser } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { getAgentPermissions, getAgentPermissionsHere, getAgentCardHere } from '../permissionQueries'

const as = (user: { id: string } | undefined) => ({ user, entities: {} }) as any
const orgTools = [{ name: 'read_file', state: 'always' }, { name: 'bash', state: 'ask' }]

async function orgAdmin() {
  const admin = await createUser()
  await prisma.userSettings.create({ data: { userId: admin.id, role: 'ADMIN' } })
  return admin
}

async function projectWith(role: 'ADMIN' | 'MEMBER') {
  const person = await createUser()
  const project = await createProject()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id, role } })
  const agent = await createAgent({ allowedTools: orgTools, approval: 'deferred' })
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  return { person, project, agent, args: { agentId: agent.id, boundaryType: 'project' as const, boundaryId: project.id } }
}

describe("the organisation's permissions @SC-617", () => {
  it('answers its admins with every tool, the approval and a summary per group', async () => {
    const agent = await createAgent({ allowedTools: orgTools, approval: 'immediate', allowedBashPatterns: [{ pattern: 'git', state: 'always' }] })
    const view = await getAgentPermissions({ agentId: agent.id }, as(await orgAdmin()))

    expect(view).toMatchObject({ agentId: agent.id, canChange: true, approval: 'immediate', bashPatterns: [{ pattern: 'git', state: 'always' }] })
    expect(view.tools.find(t => t.name === 'bash')).toMatchObject({ group: 'commands', state: 'ask' })
    expect(view.summary.find(s => s.group === 'commands')).toEqual({ group: 'commands', always: 0, ask: 1, never: 0 })
  })

  it('refuses someone who is not an organisation admin, and answers 404 for an agent that does not exist', async () => {
    const agent = await createAgent()
    await expect(getAgentPermissions({ agentId: agent.id }, as(await createUser()))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getAgentPermissions({ agentId: 'ghost' }, as(await orgAdmin()))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("a project's permissions here @SC-616 @SC-617", () => {
  it('answers every member with the organisation\'s setting beside the project\'s, and a narrowed count', async () => {
    const { person, project, agent, args } = await projectWith('MEMBER')
    await prisma.agentOverride.create({ data: {
      boundaryType: 'project', boundaryId: project.id, agentId: agent.id,
      approval: 'immediate', allowedTools: [{ name: 'read_file', state: 'never' }],
    } })

    const view = await getAgentPermissionsHere(args, as(person))

    expect(view).toMatchObject({ canChange: false, boundary: { type: 'project', id: project.id }, narrowedCount: 2 })
    expect(view.approval).toEqual({ organisation: 'deferred', here: 'immediate', effective: 'immediate', narrowed: true })
    expect(view.tools.find(t => t.name === 'read_file')).toMatchObject({ organisation: 'always', here: 'never', effective: 'never', narrowed: true })
  })

  it("lets the project's admins change it", async () => {
    const { person, args } = await projectWith('ADMIN')
    expect((await getAgentPermissionsHere(args, as(person))).canChange).toBe(true)
  })

  it('refuses someone outside the project, even an organisation admin', async () => {
    const { args } = await projectWith('ADMIN')
    await expect(getAgentPermissionsHere(args, as(await orgAdmin()))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("a person's permissions in Chat @SC-617", () => {
  it('answers only that person', async () => {
    const person = await createUser()
    const agent = await createAgent({ allowedTools: orgTools })
    const args = { agentId: agent.id, boundaryType: 'user' as const, boundaryId: person.id }

    expect(await getAgentPermissionsHere(args, as(person))).toMatchObject({ canChange: true, narrowedCount: 0 })
    await expect(getAgentPermissionsHere(args, as(await createUser()))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getAgentPermissionsHere(args, as(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("the agent's card where it is opened @SC-586", () => {
  it("in a project: the project's narrowed count and the agent's open tasks there", async () => {
    const { person, project, agent } = await projectWith('MEMBER')
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: project.id, agentId: agent.id, allowedTools: [{ name: 'bash', state: 'never' }] } })
    // The person's own narrowing is their Chat's, never a project's.
    await prisma.agentOverride.create({ data: { boundaryType: 'user', boundaryId: person.id, agentId: agent.id, approval: 'immediate' } })
    const open = await createTestTask({ data: { projectId: project.id, number: 1, title: 'Open', assignedAgentId: agent.id, onBehalfOfUserId: person.id } })
    await createTestTask({ data: { projectId: project.id, number: 2, title: 'Done', state: 'DONE', assignedAgentId: agent.id, onBehalfOfUserId: person.id } })

    const card = await getAgentCardHere({ agentId: agent.id, projectId: project.id }, as(person))

    expect(card.place).toEqual({ kind: 'project', projectId: project.id, personal: false })
    expect(card.narrowedCount).toBe(1)
    expect(card.openTasks).toEqual([{ id: open.id, key: `${project.key}-1`, title: 'Open', state: open.state, runState: open.runState }])
  })

  it("in Chat: the person's own narrowed count and no tasks", async () => {
    const person = await createUser()
    const agent = await createAgent({ allowedTools: orgTools })
    await prisma.agentOverride.create({ data: { boundaryType: 'user', boundaryId: person.id, agentId: agent.id, approval: 'immediate' } })

    expect(await getAgentCardHere({ agentId: agent.id }, as(person))).toEqual({ place: { kind: 'chat' }, narrowedCount: 1, openTasks: [] })
  })

  it('refuses a project the person is not on', async () => {
    const { project, agent } = await projectWith('MEMBER')
    await expect(getAgentCardHere({ agentId: agent.id, projectId: project.id }, as(await createUser()))).rejects.toMatchObject({ statusCode: 403 })
  })
})
