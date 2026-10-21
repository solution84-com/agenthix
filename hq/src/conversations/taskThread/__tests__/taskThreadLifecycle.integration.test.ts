/**
 * A task's thread follows its task (the overview's task-thread rules, 6; on-screen spec, A task's thread), against
 * the real test database: reassigned, the thread carries on with the new agent after a quiet line, and its next
 * turn is the new agent's; left with no agent, nothing is answered until one is assigned; archived with its task;
 * closed when the task or its project is deleted; deleted only by an admin of its project.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
  stopRunningTurn: vi.fn(),
}))

import { startTaskConversation } from '../operations'
import { claimNextTurn } from '../../coordinator/claim'
import { appendMessage, readMessages } from '../../store/messages'
import { archiveTask, deleteTask, updateTask } from '../../../projects/taskService'
import { removeAgentFromProject } from '../../../projects/agentAssignment'
import { deleteProject } from '../../../projects/projectService'
import { deleteConversation, getConversationDeletePreview, TASK_THREAD_ADMINS } from '../../work/deleting'
import { requireConversationReader } from '../../readingRule'

const ctx = (user: { id: string }) => ({ user })
let sent = 0

let projectId: string
let taskId: string
let member: { id: string }
let admin: { id: string }
let writer: { id: string; name: string }
let developer: { id: string; name: string }
let conversationId: string

async function notices(): Promise<string[]> {
  const page = await readMessages(conversationId, { limit: 50 })
  return page.filter(m => m.kind === 'NOTICE').map(m => (m.body as { text: string }).text)
}

beforeEach(async () => {
  const project = await createProject({ name: 'Shop' })
  projectId = project.id
  member = await createUserWithRole('MEMBER')
  admin = await createUserWithRole('MEMBER')
  await joinProjectAs(projectId, member.id)
  await joinProjectAs(projectId, admin.id, 'ADMIN')
  writer = await createAgent({ name: 'Writer' })
  developer = await createAgent({ name: 'Developer' })
  await prisma.projectAgent.createMany({ data: [{ projectId, agentId: writer.id }, { projectId, agentId: developer.id }] })
  const task = await createTestTask({
    data: { title: 'Fix the resize step', projectId, number: 214, assignedAgentId: writer.id, onBehalfOfUserId: member.id },
  })
  taskId = task.id
  conversationId = (await startTaskConversation({ taskId, clientMessageId: `c-${sent++}`, text: 'Hello' }, ctx(member))).conversationId
})

describe('the lead follows the task @SC-976', () => {
  it("answers with the task's agent, and after a reassignment with the new one, a quiet line between", async () => {
    const first = await claimNextTurn(conversationId)
    expect(first.claimed?.conversation.agentId).toBe(writer.id)
    await prisma.inferenceTurn.update({ where: { id: first.claimed!.turnId }, data: { state: 'COMPLETED' } })
    await prisma.conversation.update({ where: { id: conversationId }, data: { activeTurnId: null, activeTurnLeaseUntil: null } })

    await updateTask({ taskId, assignedAgentId: developer.id })
    expect(await notices()).toEqual(['Developer took over from Writer'])

    await appendMessage({ conversationId, role: 'PERSON', kind: 'TEXT', body: { text: 'Still there?' }, authorId: member.id, clientMessageId: 'again' })
    const next = await claimNextTurn(conversationId)
    expect(next.claimed?.conversation.agentId).toBe(developer.id)
    expect(await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: next.claimed!.turnId } })).toMatchObject({ agentId: developer.id })
  })

  it('writes nothing when the agent is set to the one it already has', async () => {
    await updateTask({ taskId, assignedAgentId: writer.id })
    await updateTask({ taskId, title: 'Renamed' })
    expect(await notices()).toEqual([])
  })

  it("hands its open tasks' threads over when the agent leaves the project", async () => {
    await removeAgentFromProject({ projectId, agentId: writer.id, openTasksTo: developer.id })
    expect(await notices()).toEqual(['Developer took over from Writer'])
  })

  it('answers nothing while the task has no agent, and says to assign one', async () => {
    await updateTask({ taskId, assignedAgentId: null })
    expect(await notices()).toEqual(['Writer is no longer assigned. Assign an agent to talk here.'])
    await expect(claimNextTurn(conversationId)).resolves.toMatchObject({ claimed: null })
    expect(await prisma.conversationMessage.count({ where: { conversationId, role: 'PERSON', turnId: null } })).toBe(1)
  })
})

describe('the thread follows the task @SC-978', () => {
  it('archives with its task', async () => {
    await archiveTask(taskId)
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).toMatchObject({ status: 'ARCHIVED' })
  })

  it("closes when its task is deleted, still read by the project's members", async () => {
    await deleteTask(taskId)
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } }))
      .toMatchObject({ status: 'CLOSED', closedReason: 'TASK_DELETED' })
    await expect(requireConversationReader(conversationId, member.id)).resolves.toMatchObject({ id: conversationId, projectId })
  })

  it('closes when its project is deleted', async () => {
    await deleteProject(projectId)
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } }))
      .toMatchObject({ status: 'CLOSED', closedReason: 'PROJECT_DELETED' })
  })
})

describe('deleting a task’s thread @SC-978', () => {
  it("is for an admin of its project only, and takes its messages and never the task", async () => {
    await expect(getConversationDeletePreview({ conversationId }, ctx(member))).rejects.toMatchObject({ statusCode: 403, message: TASK_THREAD_ADMINS })
    await expect(deleteConversation({ conversationId }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })

    await deleteConversation({ conversationId }, ctx(admin))
    expect(await prisma.conversation.count({ where: { id: conversationId } })).toBe(0)
    expect(await prisma.conversationMessage.count({ where: { conversationId } })).toBe(0)
    expect(await prisma.task.count({ where: { id: taskId } })).toBe(1)
  })
})
