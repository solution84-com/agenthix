/**
 * A project's Agents tool reads (every screen reviewed spec §3), against the
 * real test database with the site's run store faked: who may read them, what
 * each agent is doing here, its tasks here by state, "In this project" shown to
 * every member, and its recent runs here only.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask, createUser, ensureExecutionSite } from '../../test/factories'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))

import { getProjectAgents, getProjectAgent } from '../projectAgentQueries'

const as = (user: { id: string }) => ({ user, entities: {} }) as any
let number = 0

async function projectWithAgent(opts: { access?: 'OPEN' | 'PRIVATE' } = {}) {
  const project = await createProject({ accessLevel: opts.access ?? 'OPEN' })
  const member = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
  const agent = await createAgent()
  await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
  const task = (data: Record<string, unknown>) => createTestTask({
    data: { projectId: project.id, number: ++number, title: `Task ${number}`, assignedAgentId: agent.id, onBehalfOfUserId: member.id, ...data },
  })
  return { project, member, agent, task }
}

describe("a project's agents @SC-573", () => {
  it('answers a private project someone is not on as not found', async () => {
    const { project, agent } = await projectWithAgent({ access: 'PRIVATE' })
    const outsider = await createUser()

    await expect(getProjectAgents({ projectId: project.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getProjectAgent({ projectId: project.id, agentId: agent.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('says what each agent is doing here, with the task, and counts its tasks here by state', async () => {
    const { project, member, agent, task } = await projectWithAgent()
    const blocked = await task({ runState: 'RUN_BLOCKED', runStateReason: 'wants to run a command' })
    await task({ status: 'IN_PROGRESS', runState: 'RUN_ACTIVE' })
    await task({ status: 'DONE' })
    await task({})

    const view = await getProjectAgents({ projectId: project.id }, as(member))

    expect(view.canManage).toBe(false)
    expect(view.agents).toHaveLength(1)
    const row = view.agents[0]
    expect(row.agent.id).toBe(agent.id)
    expect(row.now).toMatchObject({ state: 'needsYou', needsYouCount: 1, runningCount: 1, lead: { taskId: blocked.id, reason: 'wants to run a command' } })
    expect(row.tasks).toEqual({ todo: 2, inProgress: 1, done: 1, needsYou: 1, running: 1, total: 4 })
  })

  it("shows every member the project's narrowing of an agent", async () => {
    const { project, member, agent } = await projectWithAgent()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: project.id, agentId: agent.id, approval: 'immediate' } })

    const view = await getProjectAgents({ projectId: project.id }, as(member))
    expect(view.agents[0]).toMatchObject({ narrowed: true })
  })

  it('answers an agent not assigned to the project as not found', async () => {
    const { project, member } = await projectWithAgent()
    const other = await createAgent()
    await expect(getProjectAgent({ projectId: project.id, agentId: other.id }, as(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("lists its recent runs in this project only", async () => {
    const { project, member, agent, task } = await projectWithAgent()
    const elsewhere = await projectWithAgent()
    const here = await task({})
    const site = await ensureExecutionSite()
    const sessionHere = await prisma.agentSession.create({ data: { agentId: agent.id, userId: member.id, sessionType: 'task', taskId: here.id, primaryOwnerType: 'project', primaryOwnerId: project.id } })
    const away = await elsewhere.task({ assignedAgentId: agent.id })
    const sessionAway = await prisma.agentSession.create({ data: { agentId: agent.id, userId: member.id, sessionType: 'task', taskId: away.id, primaryOwnerType: 'project', primaryOwnerId: elsewhere.project.id } })
    siteStore.addRun(site.siteId, { id: 'run-here', agentId: agent.id, sessionId: sessionHere.id, taskId: here.id, createdAt: '2026-10-08T10:00:00.000Z' })
    siteStore.addRun(site.siteId, { id: 'run-away', agentId: agent.id, sessionId: sessionAway.id, taskId: away.id, createdAt: '2026-10-08T11:00:00.000Z' })

    const one = await getProjectAgent({ projectId: project.id, agentId: agent.id }, as(member))

    expect(one.recentRuns.runs.map(r => r.id)).toEqual(['run-here'])
    expect(one.recentRuns.runs[0]).toMatchObject({ kind: 'task', taskKey: `${project.key}-${here.number}` })
  })
})
