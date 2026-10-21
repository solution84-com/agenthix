/**
 * Deleting a conversation, against the real test database (conversation layer spec, Failure, recovery; on-screen
 * spec, Deleting is permanent): the confirm names the work that stops and the tasks that stay, and whether it can
 * be archived instead; the delete stops worker operations, ends the standing workers' sessions on their sites,
 * detaches task operations — the task carries on — and removes the conversation. Only its opener may; a site that
 * cannot be reached refuses the delete and leaves everything as it was.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as siteStore from '../../../test/fakes/siteRuntimeStore'
import * as dispatch from '../../../test/fakes/dispatchService'
import { stopRunningTurn } from '../../coordinator/scheduler'
import { sealText } from '../../sealing'
import { archiveConversation, deleteConversation, getConversationDeletePreview } from '../deleting'

interface Made {
  person: { id: string }
  conversationId: string
  sessionId: string
  workerOp: string
  taskOp: string
  taskId: string
}

async function made(): Promise<Made> {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Developer' })
  const project = await createProject({ name: 'Shop', key: 'SHOP' })
  await joinProjectAs(project.id, person.id, 'MEMBER')
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  const session = await createSession({
    userId: person.id, agentId: agent.id, conversationId: conversation.id, primaryOwnerType: 'project', primaryOwnerId: project.id,
  })
  dispatch.placeSession(session.id, 'site-1')
  siteStore.addSession('site-1', { id: session.id })
  siteStore.addRun('site-1', { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
  const base = { conversationId: conversation.id, mode: 'BACKGROUND' as const, authorisedById: person.id }
  const worker = await prisma.operation.create({
    data: {
      ...base, kind: 'WORKER', toolName: 'start_work', idempotencyKey: 'w', state: 'RUNNING', title: sealText('Profile the pipeline'),
      boundaryType: 'project', boundaryId: project.id, siteId: 'site-1', runId: 'run-1', workerSessionId: session.id,
    },
  })
  const task = await createTestTask({ data: { title: 'Fix the resize step', projectId: project.id, number: 214, onBehalfOfUserId: person.id } })
  const taskOp = await prisma.operation.create({
    data: {
      ...base, kind: 'TASK', toolName: 'run_task', idempotencyKey: 't', state: 'QUEUED', title: sealText('SHOP-214 Fix the resize step'),
      boundaryType: 'project', boundaryId: project.id, taskId: task.id,
    },
  })
  return { person, conversationId: conversation.id, sessionId: session.id, workerOp: worker.id, taskOp: taskOp.id, taskId: task.id }
}

let m: Made
const ctx = () => ({ user: { id: m.person.id } })

beforeEach(async () => {
  vi.clearAllMocks()
  siteStore.reset()
  dispatch.reset()
  m = await made()
})

describe('the confirm @SC-975', () => {
  it('names the work that stops, by title and place, the tasks that stay, by key, and offers archiving', async () => {
    expect(await getConversationDeletePreview({ conversationId: m.conversationId }, ctx())).toEqual({
      stops: ['Profile the pipeline · Shop'],
      leaves: ['SHOP-214 Fix the resize step'],
      canArchive: true,
      messages: await prisma.conversationMessage.count({ where: { conversationId: m.conversationId } }),
      runs: await prisma.operation.count({ where: { conversationId: m.conversationId, kind: 'WORKER', runId: { not: null } } }),
    })
  })

  it('does not offer archiving a conversation already archived', async () => {
    await prisma.conversation.update({ where: { id: m.conversationId }, data: { status: 'ARCHIVED' } })
    expect((await getConversationDeletePreview({ conversationId: m.conversationId }, ctx())).canArchive).toBe(false)
  })

  it('is not shown to anyone but its opener', async () => {
    const other = await createUserWithRole('ADMIN')
    await expect(getConversationDeletePreview({ conversationId: m.conversationId }, { user: { id: other.id } })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deleting @SC-975', () => {
  it('stops the worker, ends its session on the site, detaches the task operation and leaves the task, then removes the conversation', async () => {
    await deleteConversation({ conversationId: m.conversationId }, ctx())
    expect(stopRunningTurn).toHaveBeenCalledWith(m.conversationId, 'stop')
    expect(siteStore.cancelledRuns.map(r => r.runId)).toContain('run-1')
    expect(siteStore.deleteSession).toHaveBeenCalledWith('site-1', m.sessionId)
    expect(await prisma.agentSession.count({ where: { id: m.sessionId } })).toBe(0)
    expect(await prisma.conversation.count({ where: { id: m.conversationId } })).toBe(0)
    expect(await prisma.operation.count({ where: { conversationId: m.conversationId } })).toBe(0)
    expect(await prisma.task.count({ where: { id: m.taskId } })).toBe(1)
  })

  it('removes its notifications too', async () => {
    await prisma.notification.create({ data: { userId: m.person.id, type: 'conversation_result', title: 't', body: 'b', conversationId: m.conversationId } })
    await deleteConversation({ conversationId: m.conversationId }, ctx())
    expect(await prisma.notification.count({ where: { conversationId: m.conversationId } })).toBe(0)
  })

  it('is refused when a worker\'s site cannot be reached, and the conversation stays', async () => {
    siteStore.makeSiteUnreachable('site-1')
    await expect(deleteConversation({ conversationId: m.conversationId }, ctx())).rejects.toMatchObject({ statusCode: 503 })
    expect(await prisma.conversation.count({ where: { id: m.conversationId } })).toBe(1)
    expect(await prisma.agentSession.count({ where: { id: m.sessionId } })).toBe(1)
  })

  it('is refused to anyone but its opener', async () => {
    const other = await createUserWithRole('ADMIN')
    await expect(deleteConversation({ conversationId: m.conversationId }, { user: { id: other.id } })).rejects.toMatchObject({ statusCode: 404 })
    expect(await prisma.conversation.count({ where: { id: m.conversationId } })).toBe(1)
  })
})

describe('archiving instead @SC-975', () => {
  it('hides it and keeps its work going', async () => {
    await archiveConversation({ conversationId: m.conversationId }, ctx())
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: m.conversationId } })).toMatchObject({ status: 'ARCHIVED' })
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: m.workerOp } })).state).toBe('RUNNING')
  })
})
