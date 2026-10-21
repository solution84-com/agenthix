import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, createTestTask } from '../../test/factories'

// SC-402, SC-395, R-198 against the real test DB: the agent detail page, the
// agent list and the agent's chat stats show work in a private project only to
// that project's members. Runs live on the sites, so the store is stubbed to
// return one run per session; which of them the caller may read is decided
// from hq's own session and task rows, which are real here.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getAgentDetail, getAgents, getAgentChatStats } from '../queries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const ctxFor = (userId: string) => ({
  user: { id: userId },
  entities: { Agent: prisma.agent, AgentSession: prisma.agentSession, Task: prisma.task },
}) as any

async function seed() {
  const member = await createUser()
  const outsider = await createUser()
  const routingAdmin = await createUser()
  const agent = await createAgent()
  const secretProject = await createProject({ name: 'Secret Project', accessLevel: 'PRIVATE' })
  const openProject = await createProject({ name: 'Open Project', accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: secretProject.id, userId: member.id, role: 'ADMIN' } })
  // Membership is the only gate (adr-0099): both people are in the open project, only `member` is in the private one.
  await prisma.projectMember.createMany({
    data: [member, outsider].map(u => ({ projectId: openProject.id, userId: u.id, role: 'MEMBER' as const })),
  })

  const secretTask = await createTestTask({
    data: { title: 'Secret task', projectId: secretProject.id, number: 1, assignedAgentId: agent.id, runState: 'RUN_ACTIVE', onBehalfOfUserId: member.id } as any,
  })
  const openTask = await createTestTask({
    data: { title: 'Open task', projectId: openProject.id, number: 1, assignedAgentId: agent.id, runState: 'RUN_ACTIVE', onBehalfOfUserId: member.id } as any,
  })
  const secretSession = await createSession({
    userId: routingAdmin.id, agentId: agent.id, sessionType: 'task', taskId: secretTask.id, title: 'Secret session title',
  })
  const openSession = await createSession({
    userId: routingAdmin.id, agentId: agent.id, sessionType: 'task', taskId: openTask.id, title: 'Open session title',
  })
  const outsiderChat = await createSession({ userId: outsider.id, agentId: agent.id, sessionType: 'chat', title: 'My own chat' })

  const run = (id: string, sessionId: string, text: string) => ({
    id, sessionId, status: 'COMPLETED', inputText: text, outputText: `${text} output`, model: null, usage: null,
    auditSummary: null, manifestStatus: null, startedAt: null, endedAt: null, createdAt: new Date().toISOString(),
    agentPackageDigest: null,
  })
  siteStore.listRuns.mockResolvedValue([
    run('r-secret', secretSession.id, 'secret work'),
    run('r-open', openSession.id, 'open work'),
    run('r-chat', outsiderChat.id, 'my own question'),
  ])
  siteStore.countRuns.mockResolvedValue({ count: 3 })
  return { member, outsider, agent, secretProject }
}

beforeEach(() => vi.clearAllMocks())

describe('the agent detail page shows work in a private project only to its members @SC-402', () => {
  it('drops the runs, sessions and assigned tasks of a private project for a non-member', async () => {
    const { outsider, agent } = await seed()
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(outsider.id))

    expect(detail.runs.map((r: any) => r.id).sort()).toEqual(['r-chat', 'r-open'])
    expect(detail.assignedTasks.map((t: any) => t.title)).toEqual(['Open task'])
    expect(detail.sessions.map((s: any) => s.title).sort()).toEqual(['My own chat', 'Open session title'])
    expect(detail.sessionCount).toBe(2)
    expect(detail.taskCounts.running).toBe(1)

    const text = JSON.stringify(detail)
    for (const secret of ['Secret task', 'Secret Project', 'Secret session title', 'secret work']) {
      expect(text).not.toContain(secret)
    }
  })

  it('still shows a non-member of the private project their own chat runs, and the work of a project they are in', async () => {
    const { outsider, agent } = await seed()
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(outsider.id))
    const chatRun = detail.runs.find((r: any) => r.id === 'r-chat')
    expect(chatRun).toMatchObject({ inputText: 'my own question', outputText: 'my own question output' })
    expect(detail.assignedTasks[0]).toMatchObject({ title: 'Open task', project: { name: 'Open Project' } })
  })

  it('shows a member the private project\'s runs, sessions and tasks', async () => {
    const { member, agent } = await seed()
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(member.id))

    expect(detail.runs.map((r: any) => r.id).sort()).toEqual(['r-open', 'r-secret'])
    expect(detail.assignedTasks.map((t: any) => t.title).sort()).toEqual(['Open task', 'Secret task'])
    expect(detail.sessions.map((s: any) => s.title)).toContain('Secret session title')
    expect(detail.taskCounts.running).toBe(2)
  })
})

describe("an agent's counts leave out a private project's work for a non-member @SC-395", () => {
  it('getAgents lists the agent the same for a member and an outsider, and counts no one\'s work', async () => {
    const { member, outsider, agent } = await seed()
    const asOutsider = (await getAgents(undefined, ctxFor(outsider.id))).find(a => a.id === agent.id)
    const asMember = (await getAgents(undefined, ctxFor(member.id))).find(a => a.id === agent.id)
    expect(asOutsider).toEqual(asMember)
    expect(asOutsider).not.toHaveProperty('_count')
  })

  it('getAgentChatStats counts only running tasks in projects the caller may open', async () => {
    const { member, outsider, agent } = await seed()
    expect((await getAgentChatStats({ agentId: agent.id }, ctxFor(outsider.id))).runningCount).toBe(1)
    expect((await getAgentChatStats({ agentId: agent.id }, ctxFor(member.id))).runningCount).toBe(2)
  })
})
