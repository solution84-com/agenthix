/**
 * A task's thread (the overview's task-thread rules, 6 and 7; on-screen spec, A task's thread), against the real
 * test database: created by the first message on the task's page, once; read by anyone who can see the task and
 * spoken in by anyone who may work in its project; its lead the task's agent now; an unassigned task's thread read
 * and not spoken in; the people who have spoken named on the view; the board's marks with each viewer's unread
 * count; no model knob.
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
// A thread's turn would run in the background and write to it while these tests read it.
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { getTaskConversation, getTaskThreadMarks, markConversationRead, startTaskConversation, TALKING_HERE_NEEDS_WORK } from '../operations'
import { ASSIGN_AN_AGENT } from '../lead'
import { requireConversationReader, requireConversationSpeaker } from '../../readingRule'
import { sendConversationMessage } from '../../sendMessage'
import { setConversationModel, TASK_THREAD_MODEL } from '../../modelChoice'
import { appendMessage } from '../../store/messages'

const ctx = (user: { id: string }) => ({ user })
let sent = 0
const say = (user: { id: string }, taskId: string, text = 'Can you look at this?') =>
  startTaskConversation({ taskId, clientMessageId: `c-${sent++}`, text }, ctx(user))

let projectId: string
let taskId: string
let member: { id: string }
let other: { id: string }
let viewer: { id: string }
let stranger: { id: string }
let developerId: string

beforeEach(async () => {
  const project = await createProject({ name: 'Shop' })
  projectId = project.id
  member = await createUserWithRole('MEMBER')
  other = await createUserWithRole('MEMBER')
  viewer = await createUserWithRole('MEMBER')
  stranger = await createUserWithRole('MEMBER')
  await joinProjectAs(projectId, member.id)
  await joinProjectAs(projectId, other.id)
  await joinProjectAs(projectId, viewer.id, 'VIEWER')
  developerId = (await createAgent({ name: 'Developer' })).id
  const task = await createTestTask({
    data: { title: 'Fix the resize step', projectId, number: 214, assignedAgentId: developerId, onBehalfOfUserId: member.id },
  })
  taskId = task.id
})

describe('starting a task’s thread @SC-976', () => {
  it('creates it on the first message, in the task’s home with no fixed agent, and sends later first messages into it', async () => {
    const first = await say(member, taskId)
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })
    expect(row).toMatchObject({ home: 'TASK', taskId, projectId, openedById: member.id, agentId: null, lastSeq: 1 })

    const second = await say(other, taskId, 'And the thumbnails too')
    expect(second.conversationId).toBe(first.conversationId)
    expect(await prisma.conversation.count({ where: { taskId } })).toBe(1)
    expect(await prisma.conversationMessage.findUniqueOrThrow({ where: { id: second.messageId! } })).toMatchObject({ authorId: other.id, seq: 2 })
  })

  it('stores a first message sent twice once', async () => {
    const a = await startTaskConversation({ taskId, clientMessageId: 'same', text: 'Hi' }, ctx(member))
    const b = await startTaskConversation({ taskId, clientMessageId: 'same', text: 'Hi' }, ctx(member))
    expect(b).toEqual(a)
    expect(await prisma.conversationMessage.count()).toBe(1)
  })

  it("refuses a Viewer, someone who cannot see the task, and a task with no agent", async () => {
    await expect(say(viewer, taskId)).rejects.toMatchObject({ statusCode: 403, message: TALKING_HERE_NEEDS_WORK })
    await expect(say(stranger, taskId)).rejects.toMatchObject({ statusCode: 404 })
    await prisma.task.update({ where: { id: taskId }, data: { assignedAgentId: null } })
    await expect(say(member, taskId)).rejects.toMatchObject({ statusCode: 409, message: ASSIGN_AN_AGENT })
    expect(await prisma.conversation.count()).toBe(0)
  })
})

describe('who reads and speaks in it @SC-976', () => {
  it("is anyone on the task's project; a Viewer reads only; anyone else is told it does not exist", async () => {
    const { conversationId } = await say(member, taskId)
    await expect(requireConversationSpeaker(conversationId, other.id)).resolves.toMatchObject({ home: 'TASK', agentId: developerId, projectId })
    await expect(requireConversationReader(conversationId, viewer.id)).resolves.toMatchObject({ id: conversationId })
    await expect(requireConversationSpeaker(conversationId, viewer.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(requireConversationReader(conversationId, stranger.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it("reads its lead from the task: reassigned, the next reader sees the new agent", async () => {
    const { conversationId } = await say(member, taskId)
    const writer = await createAgent({ name: 'Writer' })
    await prisma.task.update({ where: { id: taskId }, data: { assignedAgentId: writer.id } })
    await expect(requireConversationReader(conversationId, other.id)).resolves.toMatchObject({ agentId: writer.id })
  })

  it('is read and not spoken in once its task has no agent', async () => {
    const { conversationId } = await say(member, taskId)
    await prisma.task.update({ where: { id: taskId }, data: { assignedAgentId: null } })
    await expect(requireConversationReader(conversationId, other.id)).resolves.toMatchObject({ agentId: null })
    await expect(sendConversationMessage({ conversationId, clientMessageId: 'x', text: 'Hello?' }, ctx(other)))
      .rejects.toMatchObject({ statusCode: 409, message: ASSIGN_AN_AGENT })
  })
})

describe("the task's page @SC-976", () => {
  it('offers to start a thread before there is one, and says why not when it cannot', async () => {
    await expect(getTaskConversation({ taskId }, ctx(member))).resolves.toMatchObject({
      conversation: null, canStart: true, refusal: null, lead: { id: developerId, name: 'Developer' },
    })
    await expect(getTaskConversation({ taskId }, ctx(viewer))).resolves.toMatchObject({ canStart: false, refusal: TALKING_HERE_NEEDS_WORK })
    await expect(getTaskConversation({ taskId }, ctx(stranger))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("shows the thread with its task's agent and everyone who has spoken in it", async () => {
    const { conversationId } = await say(member, taskId)
    await say(other, taskId, 'Me too')
    await appendMessage({ conversationId, role: 'AGENT', kind: 'TEXT', body: { text: 'On it' }, agentId: developerId })
    const view = await getTaskConversation({ taskId }, ctx(viewer))
    expect(view.canStart).toBe(false)
    expect(view.conversation).toMatchObject({ id: conversationId, home: 'TASK', canSpeak: false, agent: { id: developerId } })
    expect(view.conversation!.people.map(p => p.id)).toEqual([member.id, other.id])
    expect(view.refusal).toMatch(/Viewer/)
  })
})

describe("the board's thread marks @SC-978", () => {
  it("count what others said since this viewer last read, and marking read clears them", async () => {
    const { conversationId } = await say(member, taskId)
    await appendMessage({ conversationId, role: 'AGENT', kind: 'TEXT', body: { text: 'On it' }, agentId: developerId })
    await appendMessage({ conversationId, role: 'PLATFORM', kind: 'NOTICE', body: { text: 'Writer took over from Developer' } })

    await expect(getTaskThreadMarks({ projectId }, ctx(member))).resolves.toEqual([{ taskId, conversationId, unread: 1 }])
    await expect(getTaskThreadMarks({ projectId }, ctx(other))).resolves.toEqual([{ taskId, conversationId, unread: 2 }])

    await markConversationRead({ conversationId, throughSeq: 3 }, ctx(other))
    await expect(getTaskThreadMarks({ projectId }, ctx(other))).resolves.toEqual([{ taskId, conversationId, unread: 0 }])
    // Never backwards, never past the last message.
    await markConversationRead({ conversationId, throughSeq: 1 }, ctx(other))
    await markConversationRead({ conversationId, throughSeq: 99 }, ctx(member))
    expect(await prisma.conversationReader.findMany({ orderBy: { userId: 'asc' } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: other.id, lastReadSeq: 3 }),
        expect.objectContaining({ userId: member.id, lastReadSeq: 3 }),
      ]))
  })

  it("are not for someone off the project", async () => {
    await say(member, taskId)
    await expect(getTaskThreadMarks({ projectId }, ctx(stranger))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the talking model @SC-976', () => {
  it('has no personal knob in a task’s thread', async () => {
    const { conversationId } = await say(member, taskId)
    await expect(setConversationModel({ conversationId, model: 'anthropic/claude-sonnet-4-5' } as never, ctx(member)))
      .rejects.toMatchObject({ statusCode: 409, message: TASK_THREAD_MODEL })
  })
})
