/**
 * The organisation's agents as a person uses them, the Projects screen's card
 * line, and usage (every screen reviewed spec §3), against the real test
 * database with the site's run store faked. What an agent is doing is read only
 * from projects the person can see; their runs and narrowing are theirs alone; one run counts for its person, its project and the organisation.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask, createUser, createUserWithRole, ensureExecutionSite } from '../../test/factories'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))

import { getOrgAgents, getAgentPlace, getAgentProfile } from '../agentPlaceQueries'
import { getAgentUsage } from '../agentUsageQueries'
import { getProjectCards } from '../../projects/projectCardQueries'

const as = (user: { id: string }) => ({ user, entities: {} }) as any
let number = 0
const usage = (tokens: number) => ({ inputTokens: tokens, outputTokens: 0, totalTokens: tokens })

async function agentInPrivateProject() {
  const agent = await createAgent()
  const insider = await createUser()
  const secret = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: secret.id, userId: insider.id, role: 'MEMBER' } })
  await prisma.projectAgent.create({ data: { projectId: secret.id, agentId: agent.id } })
  await createTestTask({ data: { projectId: secret.id, number: ++number, title: 'Secret work', assignedAgentId: agent.id, runState: 'RUN_BLOCKED', onBehalfOfUserId: insider.id } })
  return { agent, insider, secret }
}

describe("the organisation's agents @SC-578", () => {
  it("says nothing of a private project's work to someone not on it", async () => {
    const { agent, insider } = await agentInPrivateProject()
    const outsider = await createUser()

    const theirs = (await getOrgAgents(undefined, as(outsider))).agents.find(c => c.agent.id === agent.id)
    expect(theirs).toMatchObject({ projectCount: 0, inMyProjects: false, now: { state: 'idle', lead: null } })
    expect((await getOrgAgents({ filter: 'mine' }, as(outsider))).agents.map(c => c.agent.id)).not.toContain(agent.id)

    const insiders = (await getOrgAgents({ filter: 'mine' }, as(insider))).agents.find(c => c.agent.id === agent.id)
    expect(insiders).toMatchObject({ projectCount: 1, inMyProjects: true, now: { state: 'needsYou', lead: { title: 'Secret work' } } })
    expect(await getAgentProfile({ agentId: agent.id }, as(outsider))).toMatchObject({ projectCount: 0, now: { state: 'idle' } })
  })

  it('counts only the projects the person is listed on, not an open one they have not joined', async () => {
    const me = await createUser()
    const openAgent = await createAgent()
    const listedAgent = await createAgent()
    const open = await createProject()
    const listed = await createProject()
    await prisma.projectMember.create({ data: { projectId: listed.id, userId: me.id, role: 'MEMBER' } })
    await prisma.projectAgent.createMany({ data: [{ projectId: open.id, agentId: openAgent.id }, { projectId: listed.id, agentId: listedAgent.id }] })

    const all = (await getOrgAgents(undefined, as(me))).agents
    expect(all.find(c => c.agent.id === openAgent.id)).toMatchObject({ projectCount: 0, inMyProjects: false })
    expect(all.find(c => c.agent.id === listedAgent.id)).toMatchObject({ projectCount: 1, inMyProjects: true })

    const mine = (await getOrgAgents({ filter: 'mine' }, as(me))).agents.map(c => c.agent.id)
    expect(mine).toContain(listedAgent.id)
    expect(mine).not.toContain(openAgent.id)
  })

  it("gives an agent's place the person's own narrowing, and nobody else's", async () => {
    const agent = await createAgent()
    const me = await createUser()
    const someoneElse = await createUser()
    await prisma.agentOverride.create({ data: { boundaryType: 'user', boundaryId: someoneElse.id, agentId: agent.id, approval: 'immediate' } })

    const place = await getAgentPlace({ agentId: agent.id }, as(me))

    expect(place.yourNarrowing).toBeNull()
    expect(place.canManage).toBe(false)
  })
})

describe('usage for an agent and a period @SC-579', () => {
  async function arrange() {
    const site = await ensureExecutionSite()
    const agent = await createAgent()
    const me = await createUser()
    const other = await createUser()
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    const myTask = await createTestTask({ data: { projectId: project.id, number: ++number, title: 'Mine', assignedAgentId: agent.id, onBehalfOfUserId: me.id } })
    const taskSession = await prisma.agentSession.create({ data: { agentId: agent.id, userId: other.id, sessionType: 'task', taskId: myTask.id, primaryOwnerType: 'project', primaryOwnerId: project.id } })
    const otherChat = await prisma.agentSession.create({ data: { agentId: agent.id, userId: other.id, sessionType: 'chat', primaryOwnerType: 'user', primaryOwnerId: other.id } })
    siteStore.addRun(site.siteId, { id: 'r1', agentId: agent.id, sessionId: taskSession.id, taskId: myTask.id, usage: usage(100), createdAt: '2026-10-05T00:00:00.000Z' })
    siteStore.addRun(site.siteId, { id: 'r2', agentId: agent.id, sessionId: otherChat.id, usage: usage(10), createdAt: '2026-10-06T00:00:00.000Z' })
    siteStore.addRun(site.siteId, { id: 'r3', agentId: agent.id, sessionId: taskSession.id, taskId: myTask.id, usage: usage(1000), createdAt: '2026-09-01T00:00:00.000Z' })
    return { agent, me, other, project }
  }

  it("counts a run for its person, its project and the organisation, within the period", async () => {
    const { agent, me, project } = await arrange()

    const view = await getAgentUsage({ agentId: agent.id, projectId: project.id, since: '2026-10-01T00:00:00.000Z' }, as(me))

    expect(view.yours.totalTokens).toBe(100)
    expect(view.project?.totalTokens).toBe(100)
    expect(view.organisation.totalTokens).toBe(110)
    expect(view.byProject).toBeNull()
    expect(view.privateProjects).toBeNull()
    expect(view.ownSpaces).toBeNull()
  })

  it("gives an organisation admin the organisation's usage by project, people's own spaces together", async () => {
    const { agent, project } = await arrange()
    const admin = await createUserWithRole('ADMIN')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id } })

    const view = await getAgentUsage({ agentId: agent.id }, as(admin))

    expect(view.yours.totalTokens).toBe(0)
    expect(view.byProject).toEqual([{ project: { id: project.id, key: project.key, name: project.name }, usage: expect.objectContaining({ totalTokens: 1100 }) }])
    expect(view.ownSpaces?.totalTokens).toBe(10)
    expect(view.privateProjects?.totalTokens).toBe(0)
  })

  it('sums private projects the organisation admin is not on into one line, never naming them', async () => {
    const site = await ensureExecutionSite()
    const agent = await createAgent()
    const admin = await createUserWithRole('ADMIN')
    const insider = await createUser()
    const secret = await createProject({ name: 'Hidden name', key: 'HIDDENKEY', accessLevel: 'PRIVATE' })
    const adminsOwn = await createProject({ name: 'Admin is on it', accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: adminsOwn.id, userId: admin.id, role: 'MEMBER' } })
    for (const [i, p] of [secret, adminsOwn].entries()) {
      const task = await createTestTask({ data: { projectId: p.id, number: ++number, title: 't', assignedAgentId: agent.id, onBehalfOfUserId: insider.id } })
      const session = await prisma.agentSession.create({ data: { agentId: agent.id, userId: insider.id, sessionType: 'task', taskId: task.id, primaryOwnerType: 'project', primaryOwnerId: p.id } })
      siteStore.addRun(site.siteId, { id: `rp${i}`, agentId: agent.id, sessionId: session.id, taskId: task.id, usage: usage(i === 0 ? 7 : 30), createdAt: '2026-10-05T00:00:00.000Z' })
    }

    const view = await getAgentUsage({ agentId: agent.id }, as(admin))

    expect(view.byProject).toEqual([{ project: { id: adminsOwn.id, key: adminsOwn.key, name: adminsOwn.name }, usage: expect.objectContaining({ totalTokens: 30 }) }])
    expect(view.privateProjects?.totalTokens).toBe(7)
    expect(view.organisation.totalTokens).toBe(37)
    const text = JSON.stringify(view)
    expect(text).not.toContain(secret.id)
    expect(text).not.toContain('Hidden name')
    expect(text).not.toContain('HIDDENKEY')
  })

  it("refuses a project's usage to someone not on it", async () => {
    const { agent } = await arrange()
    const outsider = await createUser()
    const secret = await createProject({ accessLevel: 'PRIVATE' })
    await expect(getAgentUsage({ agentId: agent.id, projectId: secret.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("the Projects screen's card line @SC-578", () => {
  it('counts what needs a person and what is running, and says when it last ran', async () => {
    const site = await ensureExecutionSite()
    const me = await createUser()
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    const agent = await createAgent()
    const task = (data: Record<string, unknown>) => createTestTask({ data: { projectId: project.id, number: ++number, title: 't', onBehalfOfUserId: me.id, ...data } })
    await task({ assignedAgentId: agent.id, runState: 'RUN_BLOCKED' })
    await task({ assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await task({ assignedAgentId: null, runState: 'RUN_QUEUED' })
    await task({ assignedAgentId: agent.id, runState: 'RUN_QUEUED' })
    siteStore.addSession(site.siteId, { id: 's-card', primaryOwnerType: 'project', primaryOwnerId: project.id })
    siteStore.addRun(site.siteId, { id: 'r-card', sessionId: 's-card', createdAt: '2026-10-07T09:00:00.000Z', startedAt: '2026-10-07T09:00:05.000Z' })

    const { cards } = await getProjectCards(undefined, as(me))

    expect(cards.find(c => c.projectId === project.id)).toEqual({
      projectId: project.id, isMember: true, needsYouCount: 2, runningCount: 1, lastRunAt: '2026-10-07T09:00:05.000Z',
    })
  })
})
