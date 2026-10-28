/**
 * Starting and reading conversations (conversational experience spec, Who a person talks to; On screen), against
 * the real test database: a conversation starts with the person's primary agent or another of the home's, its
 * first message stored once and sealed; the person reads their own list, one conversation and its pages.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
// A started conversation's turn would run in the background and write to the thread while these tests read it.
vi.mock('../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { startConversation } from '../startConversation'
import { getConversation, getConversationMessages, getConversations } from '../conversationQueries'
import { appendMessage } from '../store/messages'
import { openJson } from '../sealing'

const ctx = (user: { id: string }) => ({ user })
let sent = 0
const start = (user: { id: string }, args: Record<string, unknown> = {}) =>
  startConversation({ home: 'PERSON', clientMessageId: `c-${sent++}`, text: 'Hello', ...args } as never, ctx(user))

afterEach(() => vi.unstubAllEnvs())

async function kernel() {
  return createAgent({ name: 'Kernel', handle: 'kernel', isKernel: true })
}

describe('starting a conversation @SC-940', () => {
  it("starts with Kernel when the person has chosen no primary agent, and stores the first message sealed", async () => {
    const k = await kernel()
    const person = await createUserWithRole('MEMBER')

    const { conversationId, messageId } = await start(person, { text: 'What is on today?' })

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })
    expect(row).toMatchObject({ home: 'PERSON', openedById: person.id, agentId: k.id, status: 'ACTIVE', lastSeq: 1 })
    const message = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: messageId! } })
    expect(message).toMatchObject({ seq: 1, role: 'PERSON', kind: 'TEXT', authorId: person.id })
    expect(message.body).not.toContain('What is on today?')
  })

  it('keeps the skill picked with `/` on the first message, and refuses one that is not a skill name, starting nothing', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const { messageId } = await start(person, { text: 'Review it', skill: { name: 'person-review' } })
    const message = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: messageId! } })
    expect(openJson(message.body)).toEqual({ text: 'Review it', skill: { name: 'person-review' } })

    await expect(start(person, { text: 'x', skill: { name: 'Bad Name' } })).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.conversation.count({ where: { openedById: person.id } })).toBe(1)
  })

  it('starts for voice with no message: the conversation is there to talk in, its first message what is said', async () => {
    const k = await kernel()
    const person = await createUserWithRole('MEMBER')

    const { conversationId, messageId } = await start(person, { text: '', voice: true })

    expect(messageId).toBeNull()
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).toMatchObject({ agentId: k.id, lastSeq: 0 })
    await expect(start(person, { text: '' })).rejects.toThrow('Write a message')
  })

  it("starts with the person's primary agent", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const writer = await createAgent({ name: 'Writer' })
    await prisma.userSettings.update({ where: { userId: person.id }, data: { primaryAgentId: writer.id } })

    const { conversationId } = await start(person)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).agentId).toBe(writer.id)
  })

  it('starts with another agent chosen before the first message', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const writer = await createAgent({ name: 'Writer' })
    const { conversationId } = await start(person, { agentId: writer.id })
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).agentId).toBe(writer.id)
  })

  it('starts one conversation for a first message sent twice', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const first = await start(person, { clientMessageId: 'same' })
    const again = await start(person, { clientMessageId: 'same' })
    expect(again).toEqual(first)
    expect(await prisma.conversation.count()).toBe(1)
  })

  it("in a project, talks only to the project's agents", async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    await joinProjectAs(project.id, person.id)
    const developer = await createAgent({ name: 'Developer' })
    const outsider = await createAgent({ name: 'Outsider' })
    await prisma.projectAgent.create({ data: { projectId: project.id, agentId: developer.id } })

    await expect(start(person, { home: 'PROJECT', projectId: project.id, agentId: outsider.id })).rejects.toMatchObject({ statusCode: 400 })
    const { conversationId } = await start(person, { home: 'PROJECT', projectId: project.id })
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } }))
      .toMatchObject({ home: 'PROJECT', projectId: project.id, agentId: developer.id })
  })

  it("refuses a project's Viewer, and someone not on the project", async () => {
    await kernel()
    const viewer = await createUserWithRole('MEMBER')
    const stranger = await createUserWithRole('MEMBER')
    const project = await createProject()
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    await expect(start(viewer, { home: 'PROJECT', projectId: project.id })).rejects.toMatchObject({ statusCode: 403 })
    await expect(start(stranger, { home: 'PROJECT', projectId: project.id })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses an empty message', async () => {
    await kernel()
    const person = await createUserWithRole('MEMBER')
    await expect(start(person, { text: '   ' })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('reading conversations @SC-942', () => {
  it("lists the person's own, most recent first, without archived ones or anyone else's", async () => {
    const person = await createUserWithRole('MEMBER')
    const older = await createConversation({ openedById: person.id, lastMessageAt: new Date('2026-10-01') })
    const newer = await createConversation({ openedById: person.id, lastMessageAt: new Date('2026-10-02') })
    await createConversation({ openedById: person.id, status: 'ARCHIVED' })
    await createConversation()

    const list = await getConversations({ home: 'PERSON' }, ctx(person))
    expect(list.map(c => c.id)).toEqual([newer.id, older.id])
  })

  it("lists a project's only for someone on it", async () => {
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    await expect(getConversations({ home: 'PROJECT', projectId: project.id }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
    await joinProjectAs(project.id, person.id)
    const mine = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id })
    expect((await getConversations({ home: 'PROJECT', projectId: project.id }, ctx(person))).map(c => c.id)).toEqual([mine.id])
  })

  it("lists and shows a project's conversations closed with it to their opener, once the project is gone", async () => {
    const person = await createUserWithRole('MEMBER')
    const project = await createProject()
    const closed = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id, status: 'CLOSED', closedReason: 'PROJECT_DELETED' })
    await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id })
    await prisma.board.deleteMany({ where: { projectId: project.id } })
    await prisma.project.delete({ where: { id: project.id } })

    const list = await getConversations({ home: 'PROJECT', projectId: project.id }, ctx(person))
    expect(list).toEqual([expect.objectContaining({ id: closed.id, status: 'CLOSED', closedReason: 'PROJECT_DELETED', projectId: project.id })])
    expect(await getConversation({ conversationId: closed.id }, ctx(person))).toMatchObject({ id: closed.id, canSpeak: false })
    const stranger = await createUserWithRole('MEMBER')
    await expect(getConversations({ home: 'PROJECT', projectId: project.id }, ctx(stranger))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('shows a conversation with its waiting messages and whether the person may speak', async () => {
    const conversation = await createConversation({ status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' })
    await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'later' }, queueState: 'WAITING' })

    const view = await getConversation({ conversationId: conversation.id }, ctx({ id: conversation.openedById }))
    expect(view).toMatchObject({ id: conversation.id, canSpeak: false, activeTurnId: null, accessProblem: null })
    expect(view.waiting.map(m => m.body)).toEqual([{ text: 'later' }])
  })

  it("pages the thread newest first, and says when there is more @SC-944", async () => {
    const conversation = await createConversation()
    for (const text of ['1', '2', '3']) {
      await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text } })
    }
    const opener = ctx({ id: conversation.openedById })

    const page = await getConversationMessages({ conversationId: conversation.id, limit: 2 }, opener)
    expect(page.messages.map(m => m.seq)).toEqual([3, 2])
    expect(page.hasMore).toBe(true)
    const rest = await getConversationMessages({ conversationId: conversation.id, beforeSeq: 2, limit: 2 }, opener)
    expect(rest).toMatchObject({ hasMore: false, messages: [{ seq: 1, body: { text: '1' } }] })
  })

  it("does not show anyone else's conversation", async () => {
    const conversation = await createConversation()
    const other = await createUserWithRole('ADMIN')
    await expect(getConversation({ conversationId: conversation.id }, ctx(other))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getConversationMessages({ conversationId: conversation.id }, ctx(other))).rejects.toMatchObject({ statusCode: 404 })
  })
})
