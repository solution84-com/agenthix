/**
 * Dispatching a task run, against the real database (@SC-339): the task session it opens or corrects, the task
 * context, model, limits and credential it carries, what started it, and the refusals. A personal project's
 * task runs as its person (agents own schedule spec §4): their storage, their runner, their credential, their
 * overrides. Site resolution, minting, overrides, credentials and limits are real; only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createUserWithRole, createTestTask } from '../../test/factories'
import { agentWithContent, apiKeyFor, dispatched, readyToDispatch } from './dispatchFixtures'

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

import { dispatchTaskRun, TASK_INPUT_MESSAGE } from '../dispatchService'
import { OnBehalfOfLostAccessError } from '../../projects/taskOnBehalfOf'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

let ready: Awaited<ReturnType<typeof readyToDispatch>>
beforeEach(async () => {
  ready = await readyToDispatch()
})

let seq = 0
async function projectTask(projectData: Record<string, unknown> = {}, taskData: Record<string, unknown> = {}, joined = true) {
  const project = await createProject({ name: 'Web App', key: `WEB${++seq}`, slug: `web-app-${seq}`, ...projectData })
  const person = await createUser()
  if (joined) await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const agent = await agentWithContent()
  const board = await prisma.board.create({
    data: { name: 'Sprint 1', projectId: project.id, columns: [{ name: 'Todo', status: 'active', description: 'not started' }] },
  })
  const task = await createTestTask({
    data: { title: 'Fix the bug', description: 'It is broken', projectId: project.id, number: 42, boardId: board.id, onBehalfOfUserId: person.id, assignedAgentId: agent.id, ...taskData },
  })
  return { project, person, agent, task }
}

describe('dispatchTaskRun', () => {
  it('opens the task session as the org admin, in the project, and dispatches the task to it', async () => {
    const { project, agent, task } = await projectTask()

    expect(await dispatchTaskRun(task.id, agent, 'person')).toMatchObject({ runId: 'run-1' })

    const session = await prisma.agentSession.findUniqueOrThrow({ where: { taskId: task.id } })
    expect(session).toMatchObject({
      title: 'Fix the bug', status: 'ACTIVE', sessionType: 'task', model: agent.defaultModel, runtime: agent.runtime,
      agentId: agent.id, userId: ready.admin.id, metadata: { agentId: agent.id },
      primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null,
    })
    const { siteId, payload, claims } = dispatched()
    expect(siteId).toBe(ready.site.siteId)
    expect(payload).toMatchObject({ kind: 'task', inputText: TASK_INPUT_MESSAGE, session: { id: session.id } })
    expect(claims).toMatchObject({ taskId: task.id, projectId: project.id, sessionId: session.id })
  })

  it('carries the task: its key, project, board and columns, and no path on the site\'s disk', async () => {
    const savedRoot = process.env.SITE_ROOT
    process.env.SITE_ROOT = '/srv/agenthix-site'
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    try {
      const { project, agent, task } = await projectTask()
      await dispatchTaskRun(task.id, agent, 'person')
      const { task: context } = dispatched().payload.context
      expect(context).toMatchObject({
        taskId: task.id, taskKey: `${project.key}-42`, title: 'Fix the bug', description: 'It is broken', projectId: project.id,
        projectName: 'Web App', projectSlug: project.slug, boardName: 'Sprint 1', columns: '- Todo (active) — not started',
      })
      expect(context).not.toHaveProperty('roadmapPath')
      expect(JSON.stringify(context)).not.toMatch(/ROADMAP|agenthix-site/)
    } finally {
      delete process.env.AGENT_CONTAINER_ISOLATION
      if (savedRoot === undefined) delete process.env.SITE_ROOT
      else process.env.SITE_ROOT = savedRoot
    }
  })

  it.each(['person', 'pulse', 'schedule', 'agent'] as const)('sends what started the run (%s), and signs it into the capability', async (startedBy) => {
    const { agent, task } = await projectTask()
    await dispatchTaskRun(task.id, agent, startedBy)
    const { payload, claims } = dispatched()
    expect(payload.startedBy).toBe(startedBy)
    expect(claims.startedBy).toBe(startedBy)
  })

  it("corrects an existing task session's location rather than leaving it without one", async () => {
    const { project, agent, task } = await projectTask()
    const old = await createSession({ agentId: agent.id, userId: ready.admin.id, sessionType: 'task', taskId: task.id })
    await dispatchTaskRun(task.id, agent, 'person')
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ primaryOwnerType: 'project', primaryOwnerId: project.id })
  })

  it("carries the project's run limits, and its override's model", async () => {
    const { project, agent, task } = await projectTask({ runTimeLimitMinutes: 20, runTurnLimit: 40 })
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: project.id, agentId: agent.id, model: 'claude-haiku-4-5' } })
    await dispatchTaskRun(task.id, agent, 'pulse')
    const { payload } = dispatched()
    expect(payload.runLimits).toEqual({ timeLimitMinutes: 20, turnLimit: 40 })
    expect(payload.model).toBe('claude-haiku-4-5')
  })

  it("uses its person's key, and the project's own before it (adr-0105)", async () => {
    const { project, person, agent, task } = await projectTask()
    await apiKeyFor('user', person.id, 'sk-person')
    await dispatchTaskRun(task.id, agent, 'person')
    expect(dispatched().payload.context.credential).toMatchObject({ apiKey: 'sk-person' })

    siteStore.reset()
    await apiKeyFor('project', project.id, 'sk-project')
    await dispatchTaskRun(task.id, agent, 'person')
    expect(dispatched().payload.context.credential).toMatchObject({ apiKey: 'sk-project' })
  })
})

describe('dispatchTaskRun refuses or finds nothing to run', () => {
  it('refuses a task whose person lost access to its project, opening no session (adr-0089)', async () => {
    const { agent, task } = await projectTask({}, {}, false)
    await expect(dispatchTaskRun(task.id, agent, 'pulse')).rejects.toBeInstanceOf(OnBehalfOfLostAccessError)
    expect(await prisma.agentSession.count({ where: { taskId: task.id } })).toBe(0)
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it('dispatches a private project\'s task for a person who is still a member', async () => {
    const { agent, task } = await projectTask({ accessLevel: 'PRIVATE' })
    await dispatchTaskRun(task.id, agent, 'pulse')
    expect(siteStore.dispatchedRuns).toHaveLength(1)
  })

  it('answers nothing for a task that no longer exists', async () => {
    const agent = await agentWithContent()
    expect(await dispatchTaskRun('gone', agent, 'person')).toBeNull()
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it('answers nothing, opening no session, when the org has no admin', async () => {
    const { agent, task } = await projectTask()
    await prisma.userSettings.update({ where: { userId: ready.admin.id }, data: { role: 'MEMBER' } })
    expect(await dispatchTaskRun(task.id, agent, 'person')).toBeNull()
    expect(await prisma.agentSession.count({ where: { taskId: task.id } })).toBe(0)
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })
})

describe("a personal project's task runs as its person", () => {
  async function personalTask() {
    const owner = await createUserWithRole('MEMBER')
    await prisma.userStoragePlacement.create({ data: { userId: owner.id, siteId: ready.site.id } })
    const project = await createProject({ name: 'My tasks', key: `MY${++seq}`, personalOwnerId: owner.id, personalSpace: true, executionSiteId: null, accessLevel: 'PRIVATE' })
    const agent = await agentWithContent()
    const task = await createTestTask({ data: { title: 'Water the plants', projectId: project.id, number: 3, onBehalfOfUserId: owner.id, assignedAgentId: agent.id } })
    return { owner, project, agent, task }
  }

  it("works in its person's own storage, on a session that is theirs, and names no project's storage", async () => {
    const { owner, agent, task } = await personalTask()
    await dispatchTaskRun(task.id, agent, 'person')
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: task.id } })).toMatchObject({
      primaryOwnerType: 'user', primaryOwnerId: owner.id, userId: owner.id,
    })
    const { payload, claims } = dispatched()
    expect(payload.context.mounts.ownerSlugs).toEqual({ [owner.id]: 'personal' })
    expect(payload.session).toMatchObject({ primaryOwnerType: 'user', primaryOwnerId: owner.id })
    expect(claims.runner).toEqual({ kind: 'person', userId: owner.id })
  })

  it("takes over an existing session as its person's", async () => {
    const { owner, agent, task } = await personalTask()
    const old = await createSession({ agentId: agent.id, userId: ready.admin.id, sessionType: 'task', taskId: task.id })
    await dispatchTaskRun(task.id, agent, 'person')
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ userId: owner.id, primaryOwnerType: 'user' })
  })

  it("uses its person's own credential and that person's overrides", async () => {
    const { owner, agent, task } = await personalTask()
    await apiKeyFor('user', owner.id, 'sk-owner')
    await prisma.agentOverride.create({ data: { boundaryType: 'user', boundaryId: owner.id, agentId: agent.id, model: 'claude-haiku-4-5' } })
    await dispatchTaskRun(task.id, agent, 'schedule')
    const { payload } = dispatched()
    expect(payload.context.credential).toMatchObject({ apiKey: 'sk-owner' })
    expect(payload.model).toBe('claude-haiku-4-5')
  })
})

describe("another personal project's task runs as its person, in the project's own storage", () => {
  it('names the project as the storage and the person as the runner and the session', async () => {
    const owner = await createUserWithRole('MEMBER')
    const project = await createProject({ name: 'Side', key: `SD${++seq}`, personalOwnerId: owner.id, executionSiteId: ready.site.id, accessLevel: 'PRIVATE' })
    const agent = await agentWithContent()
    const task = await createTestTask({ data: { title: 'Sort receipts', projectId: project.id, number: 4, onBehalfOfUserId: owner.id, assignedAgentId: agent.id } })
    await dispatchTaskRun(task.id, agent, 'person')
    expect(await prisma.agentSession.findUniqueOrThrow({ where: { taskId: task.id } })).toMatchObject({
      primaryOwnerType: 'project', primaryOwnerId: project.id, userId: owner.id,
    })
    expect(dispatched().claims.runner).toEqual({ kind: 'person', userId: owner.id })
    expect(dispatched().claims.personalProject).toEqual({ projectId: project.id, personalOwnerId: owner.id })
  })
})

afterEach(() => {
  delete process.env.AGENT_CONTAINER_ISOLATION
})
