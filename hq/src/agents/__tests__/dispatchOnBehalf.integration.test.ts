/**
 * A task's session is shared on equal footing (every-screen-reviewed spec §3, §9), against the real database:
 * a run a person starts is on their behalf, a run nobody started is on the task's person, a message into the
 * task's session is on its sender's behalf and records them, and a task run is given the task's comments.
 * Only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TASK_COMMENTS_FOR_RUN_MAX } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createSession, createWorkerSession, createUser, createUserWithRole, createTestTask } from '../../test/factories'
import { agentWithContent, dispatched, readyToDispatch } from './dispatchFixtures'

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

import { dispatchChatRun, dispatchTaskRun } from '../dispatchService'
import { RunPersonLostAccessError } from '../taskExecutionReasons'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { originOfRun } from '../../server/controlplane/runOnBehalfOf'

let ready: Awaited<ReturnType<typeof readyToDispatch>>
beforeEach(async () => {
  ready = await readyToDispatch()
})

let seq = 0
async function sharedTask(taskData: Record<string, unknown> = {}) {
  const project = await createProject({ name: 'Web', key: `SH${++seq}`, slug: `shared-${seq}`, accessLevel: 'PRIVATE' })
  const owner = await createUserWithRole('MEMBER')
  const starter = await createUserWithRole('MEMBER')
  for (const userId of [owner.id, starter.id]) await prisma.projectMember.create({ data: { projectId: project.id, userId } })
  await prisma.userSettings.update({ where: { userId: starter.id }, data: { timezone: 'Europe/Paris' } })
  const agent = await agentWithContent()
  const task = await createTestTask({
    data: { title: 'Ship', projectId: project.id, number: 1, onBehalfOfUserId: owner.id, assignedAgentId: agent.id, ...taskData },
  })
  return { project, owner, starter, agent, task }
}

describe("a task run is on behalf of whoever started it @SC-520", () => {
  it("records the person who started it, and reads times on their clock", async () => {
    const { starter, agent, task } = await sharedTask()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await dispatchTaskRun(task.id, agent, 'person')

    const { payload } = dispatched()
    expect(payload.onBehalfOfUserId).toBe(starter.id)
    expect(payload.context.person).toEqual({ timezone: 'Europe/Paris' })
    expect((await siteStore.getRun(ready.site.siteId, 'run-1'))?.metadata).toMatchObject({ dispatch: { onBehalfOfUserId: starter.id } })
  })

  it('signs the person who started it into the capability', async () => {
    const { starter, agent, task } = await sharedTask()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await dispatchTaskRun(task.id, agent, 'person')

    expect(dispatched().claims.onBehalfOfUserId).toBe(starter.id)
  })

  it("signs no person into a run nobody started, so the task's person stays the answer", async () => {
    const { starter, agent, task } = await sharedTask()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await dispatchTaskRun(task.id, agent, 'pulse')

    expect(dispatched().claims).not.toHaveProperty('onBehalfOfUserId')
  })

  it("is on the task's person when nobody started it, whatever the task last recorded", async () => {
    const { owner, starter, agent, task } = await sharedTask()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await dispatchTaskRun(task.id, agent, 'pulse')

    expect(dispatched().payload.onBehalfOfUserId).toBe(owner.id)
  })

  it('refuses a run whose starter has left the project, without blocking the task for its own person', async () => {
    const { project, starter, agent, task } = await sharedTask()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: starter.id } } })

    await expect(dispatchTaskRun(task.id, agent, 'person')).rejects.toBeInstanceOf(RunPersonLostAccessError)
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })
})

describe('a task run is given the comments @SC-522', () => {
  it("carries the newest comments, oldest first, leaving out its own agent's and the approval markers", async () => {
    const { owner, agent, task } = await sharedTask()
    const other = await agentWithContent({ handle: `reviewer-${seq}` })
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 9, minute))
    await prisma.taskComment.createMany({
      data: [
        { taskId: task.id, authorType: 'USER', userId: owner.id, content: 'Use the staging bucket.', createdAt: at(1) },
        { taskId: task.id, authorType: 'AGENT', agentId: agent.id, content: 'I did step 1.', createdAt: at(2) },
        { taskId: task.id, authorType: 'AGENT', agentId: other.id, content: 'Step 2 has a bug.', createdAt: at(3) },
        { taskId: task.id, authorType: 'AGENT', agentId: agent.id, content: '__MANIFEST_APPROVAL__:{}', createdAt: at(4) },
      ],
    })

    await dispatchTaskRun(task.id, agent, 'pulse')

    expect(dispatched().payload.context.task?.comments).toEqual([
      { author: owner.id.slice(0, 8), at: at(1).toISOString(), text: 'Use the staging bucket.' },
      { author: `@${other.handle}`, at: at(3).toISOString(), text: 'Step 2 has a bug.' },
    ])
  })

  it(`carries at most ${TASK_COMMENTS_FOR_RUN_MAX}, the newest`, async () => {
    const { owner, agent, task } = await sharedTask()
    await prisma.taskComment.createMany({
      data: Array.from({ length: TASK_COMMENTS_FOR_RUN_MAX + 5 }, (_, i) => ({
        taskId: task.id, authorType: 'USER' as const, userId: owner.id, content: `c${i}`, createdAt: new Date(Date.UTC(2026, 9, 7, 9, i)),
      })),
    })

    await dispatchTaskRun(task.id, agent, 'pulse')

    const comments = dispatched().payload.context.task?.comments ?? []
    expect(comments).toHaveLength(TASK_COMMENTS_FOR_RUN_MAX)
    expect(comments[0].text).toBe('c5')
  })
})

describe("a message into a task's session is on its sender's behalf @SC-518 @SC-520", () => {
  async function taskSession() {
    const shared = await sharedTask()
    const session = await createSession({
      userId: ready.admin.id, agentId: shared.agent.id, sessionType: 'task', taskId: shared.task.id,
      primaryOwnerType: 'project', primaryOwnerId: shared.project.id,
    })
    return { ...shared, session }
  }

  it('records the sender on the run and its message, and reads times on their clock', async () => {
    const { starter, agent, session } = await taskSession()

    await dispatchChatRun(session.id, 'Use the staging bucket', agent, null, { senderId: starter.id })

    const { payload } = dispatched()
    expect(payload.onBehalfOfUserId).toBe(starter.id)
    expect(payload.context.person).toEqual({ timezone: 'Europe/Paris' })
  })

  it('signs the sender into the capability, so a task the run creates is on their behalf', async () => {
    const { starter, agent, session } = await taskSession()

    await dispatchChatRun(session.id, 'Split this into subtasks', agent, null, { senderId: starter.id })

    expect(dispatched().claims.onBehalfOfUserId).toBe(starter.id)
  })

  it('a task the run creates is on behalf of the sender, not the person who last ran the task', async () => {
    const { project, owner, starter, agent, task, session } = await taskSession()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: owner.id } })

    await dispatchChatRun(session.id, 'Split this into subtasks', agent, null, { senderId: starter.id })

    const origin = await originOfRun({ kind: 'run', claims: dispatched().claims }, project.id, 'create_task')
    expect(origin.onBehalfOfUserId).toBe(starter.id)
  })

  it("refuses a sender who is not on the task's project, dispatching nothing", async () => {
    const { agent, session } = await taskSession()
    const outsider = await createUserWithRole('MEMBER')

    await expect(dispatchChatRun(session.id, 'Hi', agent, null, { senderId: outsider.id })).rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it("is the chat's own person in a chat", async () => {
    const person = await createUser()
    const agent = await agentWithContent()
    const session = await createWorkerSession({ userId: person.id, agentId: agent.id, sessionType: 'chat' })

    await dispatchChatRun(session.id, 'Hi', agent)

    expect(dispatched().payload.onBehalfOfUserId).toBe(person.id)
    // A chat's person is its owner; the capability carries no separate one.
    expect(dispatched().claims).not.toHaveProperty('onBehalfOfUserId')
  })
})
