/**
 * Dispatching a chat turn, against the real database: the session it runs in, where it runs, what the
 * capability names, the model and memory it carries, and the refusals before anything reaches a site.
 * Site resolution, minting, boundary overrides, credentials and memory are real; only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createWorkerSession, createUser, createUserWithRole, createTestTask } from '../../test/factories'
import { agentWithContent, dispatched, orgModel, readyToDispatch } from './dispatchFixtures'
import { createSubscription } from '../../routing/__tests__/routingFixtures'
import { secondSite } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  // Listing a person's workspaces asks the site; these people have none.
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})

import { dispatchChatRun } from '../dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

let site: Awaited<ReturnType<typeof readyToDispatch>>['site']
beforeEach(async () => {
  ;({ site } = await readyToDispatch())
})

/** A person (a Member) chatting with an agent in their own storage. */
async function chat(sessionData: Record<string, unknown> = {}, agentData: Record<string, unknown> = {}) {
  const person = await createUserWithRole('MEMBER')
  const agent = await agentWithContent(agentData)
  const session = await createWorkerSession({ agentId: agent.id, userId: person.id, sessionType: 'chat', title: 'A chat', metadata: { context: 'some context' }, ...sessionData })
  return { person, agent, session }
}

describe('dispatchChatRun', () => {
  it("dispatches the person's turn to the site holding their storage, with the session's context and no task", async () => {
    const { agent, session, person } = await chat()
    await orgModel()

    expect(await dispatchChatRun(session.id, 'Hello there', agent)).toEqual({ runId: 'run-1' })

    const { siteId, payload, claims } = dispatched()
    expect(siteId).toBe(site.siteId)
    expect(payload).toMatchObject({ kind: 'chat', startedBy: 'person', inputText: 'Hello there', hideUserMessage: false, model: 'claude-sonnet-4-6' })
    expect(payload.context.chat).toEqual({ sessionContext: 'some context' })
    expect(payload.context.task).toBeUndefined()
    expect(claims).toMatchObject({ sessionId: session.id, siteId: site.siteId, runner: { kind: 'person', userId: person.id }, taskId: null, projectId: null })
  })

  it('sends no session context when the session has none, and passes the hidden-message flag through', async () => {
    const { agent, session } = await chat({ metadata: {} })
    await dispatchChatRun(session.id, 'Hi', agent, null, { hideUserMessage: true })
    const { payload } = dispatched()
    expect(payload.context.chat).toEqual({ sessionContext: null })
    expect(payload.hideUserMessage).toBe(true)
  })

  it("sends the resolved model, and the session's own only when nothing resolves", async () => {
    const { agent, session } = await chat()
    await dispatchChatRun(session.id, 'Hi', agent, 'claude-opus-4')
    expect(dispatched().payload.model).toBe('claude-opus-4')
    siteStore.reset()
    await orgModel()
    await dispatchChatRun(session.id, 'Hi', agent, 'claude-opus-4')
    expect(dispatched().payload.model).toBe('claude-sonnet-4-6')
  })

  it('cuts a title over 500 characters in the session it sends', async () => {
    const { agent, session } = await chat({ title: 'x'.repeat(600) })
    await dispatchChatRun(session.id, 'Hi', agent)
    expect(dispatched().payload.session.title).toBe('x'.repeat(500))
  })

  it('carries no memory: the run recalls it through HQ', async () => {
    const { agent, session } = await chat()
    await dispatchChatRun(session.id, 'Hi', agent)
    expect('memory' in dispatched().payload.context).toBe(false)
  })

  it("a chat opened on a project's files runs on the site holding them, and its capability names the project", async () => {
    const other = await secondSite()
    const project = await createProject({ name: 'Far', executionSiteId: other.id })
    const { agent, session } = await chat({ primaryOwnerType: 'project', primaryOwnerId: project.id })

    await dispatchChatRun(session.id, 'Hi', agent)

    const { siteId, claims } = dispatched()
    expect(siteId).toBe(other.siteId)
    expect(claims).toMatchObject({ siteId: other.siteId, projectId: project.id })
  })

  it("a chat about a task carries the task into its capability, which anchors the task's project", async () => {
    const project = await createProject({ name: 'P' })
    const owner = await createUser()
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: owner.id } })
    const { agent, session, person } = await chat({ taskId: task.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
    await dispatchChatRun(session.id, 'Hi', agent)
    expect(dispatched().claims).toMatchObject({ taskId: task.id, projectId: project.id })
  })

  it("is given the organisation's provider of the resolved model", async () => {
    const { agent, session } = await chat()
    const { provider } = await orgModel('anthropic', 'sk-test-org')
    await dispatchChatRun(session.id, 'Hi', agent)
    expect(dispatched().payload.context.modelAccess?.provider).toMatchObject({ kind: 'api_key', providerId: provider.id, apiKey: 'sk-test-org' })
  })

  it("grants the person's own subscription, when it is their default, to the site, session and runner the capability names", async () => {
    const { agent, session, person } = await chat()
    await orgModel()
    const login = await createSubscription(person.id)
    await prisma.agentModelChoices.create({ data: { agentId: agent.id, conversationProviderId: login.id, conversationModel: 'claude-sonnet-4-6' } })

    await dispatchChatRun(session.id, 'Hi', agent)

    expect(dispatched().payload.context.modelAccess?.provider).toMatchObject({ kind: 'subscription', providerId: login.id })
    expect(await prisma.subscriptionGrant.findMany({ where: { providerId: login.id } })).toEqual([
      expect.objectContaining({ siteId: site.siteId, sessionId: session.id, runnerKind: 'person', runnerId: person.id }),
    ])
  })
})

describe('dispatchChatRun refuses before anything reaches a site', () => {
  it('a session that does not exist', async () => {
    const agent = await agentWithContent()
    await expect(dispatchChatRun('missing', 'Hi', agent)).rejects.toThrow(/missing/)
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it('a closed conversation (adr-0076)', async () => {
    const { agent, session } = await chat({ status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' })
    await expect(dispatchChatRun(session.id, 'Hi', agent)).rejects.toThrow('This conversation is closed')
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it('a run whose capability cannot be minted — its project names no site', async () => {
    const project = await createProject({ name: 'Nowhere', executionSiteId: null })
    const { agent, session } = await chat({ primaryOwnerType: 'project', primaryOwnerId: project.id })
    await expect(dispatchChatRun(session.id, 'Hi', agent)).rejects.toThrow()
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })
})
