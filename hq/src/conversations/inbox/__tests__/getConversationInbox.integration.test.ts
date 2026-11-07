/**
 * The chat's bar and its Conversations list, against the real test database: every conversation the person can
 * open, newest first, each with what needs them, what they have not read and its last line; scoped as the
 * reading rule scopes one conversation.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { getConversationInbox } from '../getConversationInbox'
import { requireConversationReader } from '../../readingRule'
import { appendMessage } from '../../store/messages'

const ctx = (user: { id: string }) => ({ user })

async function say(conversationId: string, authorId: string | null, text: string, at: string) {
  const role = authorId ? 'PERSON' : 'AGENT'
  await appendMessage({ conversationId, role, authorId, kind: 'TEXT', body: { text } })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(at) } })
}

async function operation(conversationId: string, state: 'WAITING_FOR_APPROVAL' | 'RUNNING', authorisedById: string) {
  await prisma.operation.create({
    data: {
      conversationId, kind: 'TOOL', mode: 'FOREGROUND', toolName: 'run', idempotencyKey: `${state}-${Math.random()}`,
      state, title: 'sealed', authorisedById,
    } as any,
  })
}

describe('the conversations a person can open', () => {
  it('lists their own, newest first, scoped as the reading rule scopes each', async () => {
    const person = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    const project = await createProject({ name: 'Website relaunch' })
    const left = await createProject({ name: 'Old project' })
    await joinProjectAs(project.id, person.id)
    await joinProjectAs(left.id, person.id)

    const space = await createConversation({ openedById: person.id })
    const inProject = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id })
    const archived = await createConversation({ openedById: person.id, status: 'ARCHIVED' })
    const someoneElses = await createConversation({ openedById: other.id })
    const leftBehind = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: left.id })
    const closedWhenLeft = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: left.id, status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
    await say(space.id, person.id, 'hi', '2026-11-05T07:00:00Z')
    await say(inProject.id, person.id, 'hi', '2026-11-05T08:00:00Z')
    await say(closedWhenLeft.id, person.id, 'hi', '2026-11-05T06:00:00Z')
    await prisma.projectMember.deleteMany({ where: { projectId: left.id, userId: person.id } })

    const inbox = await getConversationInbox(undefined, ctx(person))
    expect(inbox.conversations.map((c) => c.id)).toEqual([inProject.id, space.id, closedWhenLeft.id])
    for (const c of inbox.conversations) await expect(requireConversationReader(c.id, person.id)).resolves.toBeTruthy()
    await expect(requireConversationReader(leftBehind.id, person.id)).rejects.toThrow()
    expect(inbox.conversations.map((c) => c.id)).not.toContain(archived.id)
    expect(inbox.conversations.map((c) => c.id)).not.toContain(someoneElses.id)
    expect(inbox.conversations[0].place).toEqual({ kind: 'project', id: project.id, key: project.key, name: 'Website relaunch' })
    expect(inbox.conversations[1].place).toEqual({ kind: 'space' })
  })

  it('carries what needs them, what is unread since they last read, work under way, the last line and the totals', async () => {
    const person = await createUserWithRole('MEMBER')
    const asks = await createConversation({ openedById: person.id })
    const replied = await createConversation({ openedById: person.id })
    const quiet = await createConversation({ openedById: person.id })
    await say(asks.id, person.id, 'Why are two pages slow?', '2026-11-05T08:00:00Z')
    await operation(asks.id, 'WAITING_FOR_APPROVAL', person.id)
    await say(replied.id, person.id, 'Shorter intro, please.', '2026-11-05T07:00:00Z')
    await say(replied.id, null, 'Done: the intro is two sentences.', '2026-11-05T07:01:00Z')
    await say(replied.id, null, 'Anything else?', '2026-11-05T07:02:00Z')
    await say(quiet.id, person.id, 'Thanks', '2026-11-05T06:00:00Z')
    await operation(quiet.id, 'RUNNING', person.id)

    let inbox = await getConversationInbox(undefined, ctx(person))
    const byId = (id: string) => inbox.conversations.find((c) => c.id === id)!
    expect(byId(asks.id)).toMatchObject({ needsYou: 1, unread: 0, working: false, lastLine: { by: 'you', text: 'Why are two pages slow?' } })
    expect(byId(replied.id)).toMatchObject({ needsYou: 0, unread: 2, lastSeq: 3, lastLine: { by: 'agent', text: 'Anything else?' } })
    expect(byId(quiet.id)).toMatchObject({ needsYou: 0, unread: 0, working: true })
    expect(inbox).toMatchObject({ waiting: 2, needsYou: 1, unread: 1 })

    await prisma.conversationReader.create({ data: { conversationId: replied.id, userId: person.id, lastReadSeq: 2 } })
    inbox = await getConversationInbox(undefined, ctx(person))
    expect(byId(replied.id).unread).toBe(1)
  })

  it('lists only the archived ones when asked, in the same scope', async () => {
    const person = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    const project = await createProject({ name: 'Website relaunch' })
    const left = await createProject({ name: 'Old project' })
    await joinProjectAs(project.id, person.id)
    await joinProjectAs(left.id, person.id)
    const open = await createConversation({ openedById: person.id })
    const archivedInSpace = await createConversation({ openedById: person.id, status: 'ARCHIVED' })
    const archivedInProject = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: project.id, status: 'ARCHIVED' })
    const archivedLeft = await createConversation({ openedById: person.id, home: 'PROJECT', projectId: left.id, status: 'ARCHIVED' })
    const someoneElses = await createConversation({ openedById: other.id, status: 'ARCHIVED' })
    await prisma.projectMember.deleteMany({ where: { projectId: left.id, userId: person.id } })

    const archived = await getConversationInbox({ archived: true }, ctx(person))
    expect(archived.conversations.map((c) => c.id).sort()).toEqual([archivedInSpace.id, archivedInProject.id].sort())
    expect(archived.conversations.map((c) => c.id)).not.toContain(archivedLeft.id)
    expect(archived.conversations.map((c) => c.id)).not.toContain(someoneElses.id)
    expect((await getConversationInbox({ archived: false }, ctx(person))).conversations.map((c) => c.id)).toEqual([open.id])
  })

  it('is empty for someone with no conversations, and refused to no one signed in', async () => {
    const person = await createUserWithRole('MEMBER')
    expect(await getConversationInbox(undefined, ctx(person))).toEqual({ conversations: [], waiting: 0, needsYou: 0, unread: 0 })
    await expect(getConversationInbox(undefined, { user: null })).rejects.toThrow('Not authenticated')
  })
})
