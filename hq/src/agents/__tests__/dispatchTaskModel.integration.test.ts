/**
 * A task's run follows the work models, against the real database and through the real dispatch: it takes its
 * boundary's light-work model on the runtime that can be given it — OpenCode for a model only an OpenRouter key
 * reaches, though the agent is on the Claude SDK — with the credential for that model. A task's session on another
 * runtime is replaced, unless something in it carries on. Only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../test/factories'
import { agentWithContent, apiKeyFor, dispatched, readyToDispatch } from './dispatchFixtures'
import { orgKey } from '../../model-access/__tests__/runCredentialFixtures'

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
  const agent = await agentWithContent({ runtime: 'claude-sdk', defaultModel: 'claude-sonnet-4-6' })
  const task = await createTestTask({
    data: { title: 'Walk the dog', projectId: project.id, number: 2, onBehalfOfUserId: person.id, assignedAgentId: agent.id },
  })
  return { project, person, agent, task }
}

const orgLightWork = (lightWork: string) =>
  prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', talking: lightWork, lightWork, heavyWork: lightWork } })

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

describe("a task's run takes the light-work model @SC-955", () => {
  it("runs on OpenCode with the organisation's OpenRouter model and key when the agent is on the Claude SDK", async () => {
    const t = await projectTask()
    await orgLightWork(OPEN_ROUTER)
    await orgKey('openrouter', 'sk-or')

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    const session = await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })
    expect(session).toMatchObject({ runtime: 'opencode', model: OPEN_ROUTER })
    const { payload } = dispatched()
    expect(payload.model).toBe(OPEN_ROUTER)
    expect(payload.session).toMatchObject({ runtime: 'opencode', model: OPEN_ROUTER })
    expect(payload.context.credential).toMatchObject({ kind: 'apiKey', provider: 'openrouter', apiKey: 'sk-or' })
    expect(payload.context.credentialProblem).toBeUndefined()
  })

  it("stays on the agent's runtime when it offers the light-work model", async () => {
    const t = await projectTask()
    await orgLightWork(HAIKU)
    await apiKeyFor('project', t.project.id, 'sk-project')

    await dispatchTaskRun(t.task.id, t.agent, 'pulse')

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ runtime: 'claude-sdk', model: HAIKU })
    const { payload } = dispatched()
    expect(payload.model).toBe(HAIKU)
    expect(payload.context.credential).toMatchObject({ provider: 'anthropic', apiKey: 'sk-project' })
  })

  it("is the agent's own model on its own runtime when no policy names one", async () => {
    const t = await projectTask()
    await dispatchTaskRun(t.task.id, t.agent, 'schedule')
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ runtime: 'claude-sdk', model: 'claude-sonnet-4-6' })
    expect(dispatched().payload.model).toBe('claude-sonnet-4-6')
  })

  it("gives a session it keeps on the same runtime the run's model", async () => {
    const t = await projectTask()
    const old = await claudeSession(t)
    await orgLightWork(HAIKU)

    await dispatchTaskRun(t.task.id, t.agent, 'person')

    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: t.task.id } })).toMatchObject({ id: old.id, runtime: 'claude-sdk', model: HAIKU })
    expect(dispatched().payload.model).toBe(HAIKU)
  })
})

describe("a task's session on another runtime @SC-955", () => {
  it('is replaced by one on the runtime the run needs, on the site and in hq', async () => {
    const t = await projectTask()
    const old = await claudeSession(t, { status: 'FAILED' })
    await orgLightWork(OPEN_ROUTER)
    await orgKey('openrouter', 'sk-or')

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
    await orgLightWork(OPEN_ROUTER)

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
    await orgLightWork(OPEN_ROUTER)

    await dispatchTaskRun(t.task.id, t.agent, 'pulse')

    const { payload } = dispatched()
    expect(payload.session).toMatchObject({ id: old.id, runtime: 'claude-sdk' })
    expect(payload.inputText).toBe(TASK_CONTINUE_MESSAGE)
  })
})
