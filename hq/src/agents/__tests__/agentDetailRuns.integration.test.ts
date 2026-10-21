/**
 * The runs on an agent's detail page, against the real database (@SC-280, ADR-0041): another person's chat runs
 * and chat sessions are never shown, task runs are, the token total counts every run, and the runs are read
 * from every site the agent's sessions are on. Private-project work is agentDetailProjectPrivacy.integration's.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createUser, ensureExecutionSite, createTestTask } from '../../test/factories'
import { secondSite } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getAgentDetail } from '../queries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const ctxFor = (userId: string) => ({
  user: { id: userId },
  entities: { Agent: prisma.agent, AgentSession: prisma.agentSession, Task: prisma.task },
}) as any

/** An agent with the owner's chat and a task session in an open project, each with one run on the install's site. */
async function seed() {
  const site = await ensureExecutionSite()
  const owner = await createUser()
  const other = await createUser()
  const agent = await createAgent()
  const project = await createProject({ name: 'Open', executionSiteId: site.id })
  await prisma.projectMember.createMany({ data: [owner, other].map(u => ({ projectId: project.id, userId: u.id })) })
  const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: owner.id } })
  const chat = await createSession({ agentId: agent.id, userId: owner.id, sessionType: 'chat', title: 'Owner chat title' })
  const taskSession = await createSession({
    agentId: agent.id, userId: owner.id, sessionType: 'task', taskId: task.id, title: 'Task session', primaryOwnerType: 'project', primaryOwnerId: project.id,
  })
  const run = (id: string, sessionId: string, text: string, tokens: number, createdAt: string) =>
    siteStore.addRun(site.siteId, {
      id, agentId: agent.id, sessionId, inputText: text, outputText: `${text} reply`, createdAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: tokens },
    })
  run('r-chat', chat.id, 'private chat message', 100, '2026-01-02T00:00:00Z')
  run('r-task', taskSession.id, 'do the task', 50, '2026-01-01T00:00:00Z')
  return { site, owner, other, agent, project, chat }
}

describe('getAgentDetail', () => {
  it('refuses a caller who is not signed in', async () => {
    const { agent } = await seed()
    await expect(getAgentDetail({ id: agent.id }, { user: null } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('answers 404 for an agent that does not exist', async () => {
    await expect(getAgentDetail({ id: 'missing' }, ctxFor((await createUser()).id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("shows anyone else the task runs and sessions but none of the owner's chat, while the token total counts every run", async () => {
    const { other, agent } = await seed()
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(other.id))

    expect(detail.runs.map((r: { id: string }) => r.id)).toEqual(['r-task'])
    expect(detail.sessions.map((s: { title: string }) => s.title)).toEqual(['Task session'])
    expect(detail.totalTokens).toBe(150)
    expect(detail).not.toHaveProperty('packageVersion')
    const text = JSON.stringify(detail)
    expect(text).not.toContain('private chat message')
    expect(text).not.toContain('Owner chat title')
  })

  it('shows the owner their own chat runs and sessions', async () => {
    const { owner, agent } = await seed()
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(owner.id))
    expect(detail.runs.map((r: { id: string }) => r.id)).toEqual(['r-chat', 'r-task'])
    expect(detail.sessions.map((s: { title: string }) => s.title).sort()).toEqual(['Owner chat title', 'Task session'])
  })

  it('shows a task run whose task was deleted, as org activity', async () => {
    const { site, other, agent, owner } = await seed()
    const orphan = await createSession({ agentId: agent.id, userId: owner.id, sessionType: 'task', title: null })
    siteStore.addRun(site.siteId, { id: 'r-orphan', agentId: agent.id, sessionId: orphan.id, createdAt: '2026-01-03T00:00:00Z' })
    const detail = await getAgentDetail({ id: agent.id }, ctxFor(other.id))
    expect(detail.runs.map((r: { id: string }) => r.id)).toContain('r-orphan')
  })

  it('reads every site the agent has a session on, merging the runs newest first and summing the counts and tokens', async () => {
    const { other, agent, owner } = await seed()
    const far = await secondSite()
    const farProject = await createProject({ name: 'Far', executionSiteId: far.id })
    const farSession = await createSession({ agentId: agent.id, userId: owner.id, sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: farProject.id })
    siteStore.addRun(far.siteId, {
      id: 'r-far', agentId: agent.id, sessionId: farSession.id, createdAt: '2026-01-05T00:00:00Z',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 5 },
    })

    const detail = await getAgentDetail({ id: agent.id }, ctxFor(other.id))

    expect(detail.runCount).toBe(3)
    expect(detail.totalTokens).toBe(155)
    expect(detail.runs.map((r: { id: string }) => r.id)).toEqual(['r-far', 'r-task'])
  })

  it('answers 503, naming the site, when a site holding its runs cannot be reached (SC-344)', async () => {
    const { site, owner, agent } = await seed()
    siteStore.makeSiteUnreachable(site.siteId)
    await expect(getAgentDetail({ id: agent.id }, ctxFor(owner.id))).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining(site.siteId),
    })
  })
})
