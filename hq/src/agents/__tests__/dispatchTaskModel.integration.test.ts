/**
 * A task's run follows the resolver (models from one place, part 4), against the real database and through the real
 * dispatch: it takes the default worker model on the runtime that model and its provider follow — OpenCode for a model
 * via OpenRouter — and is given that provider. A task's session on another runtime is replaced, unless something in
 * it carries on. Only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../test/factories'
import { agentWithContent, dispatched, readyToDispatch } from './dispatchFixtures'
import { createProvider, setOrgDefaults } from '../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})

import { dispatchTaskRun, TASK_CONTINUE_MESSAGE } from '../dispatchService'
import { markTaskConversationPaused } from '../../sites/scheduled/runHold'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const OPEN_ROUTER = 'openrouter/~deepseek/deepseek-flash-latest'
const HAIKU = 'claude-haiku-4-5'

let ready: Awaited<ReturnType<typeof readyToDispatch>>
beforeEach(async () => {
  ready = await readyToDispatch()
})

let seq = 0
/** A project task assigned to a Claude SDK agent on its own Claude model, as Kernel is. */
async function projectTask() {
  const project = await createProject({ name: 'Walk', key: `WAL${++seq}`, slug: `walk-${seq}` })
  const person = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const agent = await agentWithContent()
  const task = await createTestTask({
    data: { title: 'Walk the dog', projectId: project.id, number: 2, onBehalfOfUserId: person.id, assignedAgentId: agent.id },
  })
  return { project, person, agent, task }
}

/** The organisation's default worker model, in the runtime's form (`openrouter/…` or a bare Claude id), via a new provider. */
async function orgWorker(model: string, key = 'sk-test-fake') {
  const vendor = model.startsWith('openrouter/') ? 'openrouter' as const : 'anthropic' as const
  const provider = await createProvider({ vendor, key })
  await setOrgDefaults({ worker: { providerId: provider.id, model: vendor === 'openrouter' ? model.slice('openrouter/'.length) : model } })
  return provider
}

/** A session the task already has on the Claude SDK, on the site too, with its newest run as given. */
async function claudeSession(t: Awaited<ReturnType<typeof projectTask>>, run: Partial<Parameters<typeof siteStore.addRun>[1]> = {}) {
  const session = await createSession({
    agentId: t.agent.id, userId: ready.admin.id, sessionType: 'task', taskId: t.task.id, runtime: 'claude-sdk', model: 'claude-sonnet-4-6',
    primaryOwnerType: 'project', primaryOwnerId: t.project.id,
  })
  siteStore.addSession(ready.site.siteId, { id: session.id, taskId: t.task.id, runtime: 'claude-sdk', sessionType: 'task' })
  siteStore.addRun(ready.site.siteId, { id: `old-${session.id}`, sessionId: session.id, taskId: t.task.id, status: 'COMPLETED', ...run })
  return session
}

describe("a task's run takes the default worker model @SC-955", () => {
  it("runs on OpenCode with the organisation's OpenRouter model and key when the agent is on the Claude SDK", async () => {
    const t = await projectTask()
    const provider = await orgWorker(OPEN_ROUTER, 'sk-test-or')

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    const session = await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })
    expect(session).toMatchObject({ runtime: 'opencode', model: OPEN_ROUTER })
    const { payload } = dispatched()
    expect(payload.model).toBe(OPEN_ROUTER)
    expect(payload.session).toMatchObject({ runtime: 'opencode', model: OPEN_ROUTER })
    expect(payload.context.credential).toBeNull()
    expect(payload.context.modelAccess).toMatchObject({ provider: { kind: 'api_key', providerId: provider.id, vendor: 'openrouter', apiKey: 'sk-test-or' } })
    expect(payload.context.credentialProblem).toBeUndefined()
  })

  it('runs a Claude model via Anthropic on Claude Code', async () => {
    const t = await projectTask()
    await orgWorker(HAIKU, 'sk-test-ant')

    await dispatchTaskRun(t.task.id, t.agent, 'pulse')

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ runtime: 'claude-sdk', model: HAIKU })
    const { payload } = dispatched()
    expect(payload.model).toBe(HAIKU)
    expect(payload.context.modelAccess?.provider).toMatchObject({ vendor: 'anthropic', apiKey: 'sk-test-ant' })
  })

  it('with no provider, is dispatched with the problem, which the site fails it with', async () => {
    const t = await projectTask()
    await dispatchTaskRun(t.task.id, t.agent, 'schedule')
    const { payload } = dispatched()
    expect(payload.context.modelAccess).toBeUndefined()
    expect(payload.context.credentialProblem).toMatch(/No model provider is working/)
  })

  it("gives a session it keeps on the same runtime the run's model", async () => {
    const t = await projectTask()
    const old = await claudeSession(t)
    await orgWorker(HAIKU)

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ id: old.id, runtime: 'claude-sdk', model: HAIKU })
    expect(dispatched().payload.model).toBe(HAIKU)
  })
})

describe("a task's session on another runtime @SC-955", () => {
  it('is replaced by one on the runtime the run needs, on the site and in hq', async () => {
    const t = await projectTask()
    const old = await claudeSession(t, { status: 'FAILED' })
    await orgWorker(OPEN_ROUTER)

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    const now = await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })
    expect(now.id).not.toBe(old.id)
    expect(now).toMatchObject({ runtime: 'opencode', model: OPEN_ROUTER, sessionType: 'task' })
    expect(await prisma.agentSession.findUnique({ where: { id: old.id } })).toBeNull()
    expect(await siteStore.getSession(ready.site.siteId, old.id)).toBeNull()
    expect(dispatched().payload.session).toMatchObject({ id: now.id, runtime: 'opencode' })
  })

  it('is kept for the run an approval was given for, which carries on where it asked', async () => {
    const t = await projectTask()
    const old = await claudeSession(t, { manifestStatus: 'APPROVED', pendingManifest: { tools: [{ name: 'Bash', reason: 'list the files' }], bashPatterns: [] } })
    await orgWorker(OPEN_ROUTER)

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ id: old.id, runtime: 'claude-sdk', model: 'claude-sonnet-4-6' })
    const { payload } = dispatched()
    expect(payload.session).toMatchObject({ id: old.id, runtime: 'claude-sdk' })
    expect(payload.model).toBe('claude-sonnet-4-6')
  })

  it('is kept for a run paused for a scheduled change, which carries on in the same conversation', async () => {
    const t = await projectTask()
    const old = await claudeSession(t)
    await markTaskConversationPaused(t.task.id)
    await orgWorker(OPEN_ROUTER)

    await dispatchTaskRun(t.task.id, t.agent, 'pulse')

    const { payload } = dispatched()
    expect(payload.session).toMatchObject({ id: old.id, runtime: 'claude-sdk' })
    expect(payload.inputText).toBe(TASK_CONTINUE_MESSAGE)
  })
})
