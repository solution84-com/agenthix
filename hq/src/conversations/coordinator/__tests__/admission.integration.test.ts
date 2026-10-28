/**
 * Admitting a message and the waiting message (conversation layer spec, A message while a reply streams),
 * against the real test database: a message is stored once under the client's id; while a turn runs it waits,
 * or stops the turn by the sender's setting; a waiting message is cancelled only by its sender and only while
 * it waits. Turns themselves are not run here: scheduling is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { sendConversationMessage } from '../../sendMessage'
import { cancelWaitingConversationMessage, sendWaitingConversationMessageNow } from '../../waitingMessages'
import { stopConversationTurn } from '../../stopTurn'
import { scheduleConversation } from '../scheduler'
import { openJson } from '../../sealing'

const ctx = (user: { id: string }) => ({ user })
let n = 0
const send = (user: { id: string }, conversationId: string, text = 'hello', clientMessageId = `c-${n++}`) =>
  sendConversationMessage({ conversationId, clientMessageId, text }, ctx(user))

async function conversationOf() {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id })
  return { person, conversation }
}

async function running(conversationId: string) {
  const turn = await prisma.inferenceTurn.create({ data: { conversationId, trigger: 'MESSAGE', state: 'RUNNING' } })
  await prisma.conversation.update({ where: { id: conversationId }, data: { activeTurnId: turn.id, activeTurnLeaseUntil: new Date(Date.now() + 30_000) } })
  return turn
}

beforeEach(() => vi.mocked(scheduleConversation).mockClear())

describe('sending a message @SC-945', () => {
  it('stores it in order, not waiting, and schedules a turn when none runs', async () => {
    const { person, conversation } = await conversationOf()
    const result = await send(person, conversation.id)
    expect(result).toMatchObject({ seq: 1, queued: false, duplicate: false })
    const row = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: result.messageId } })
    expect(row).toMatchObject({ role: 'PERSON', kind: 'TEXT', authorId: person.id, queueState: null, turnId: null })
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
  })

  it('keeps the skill picked with `/` on the message, and refuses one that is not a skill name, storing nothing', async () => {
    const { person, conversation } = await conversationOf()
    const sent = await sendConversationMessage({ conversationId: conversation.id, clientMessageId: `c-${n++}`, text: 'review it', skill: { name: 'org-code-review' } }, ctx(person))
    const row = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: sent.messageId } })
    expect(openJson(row.body)).toEqual({ text: 'review it', skill: { name: 'org-code-review' } })

    await expect(sendConversationMessage({ conversationId: conversation.id, clientMessageId: `c-${n++}`, text: 'x', skill: { name: '/init' } }, ctx(person)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.conversationMessage.count({ where: { conversationId: conversation.id } })).toBe(1)
  })

  it('stores a message sent twice once', async () => {
    const { person, conversation } = await conversationOf()
    const first = await send(person, conversation.id, 'hi', 'same')
    const again = await send(person, conversation.id, 'hi', 'same')
    expect(again).toMatchObject({ messageId: first.messageId, seq: 1, duplicate: true })
    expect(await prisma.conversationMessage.count({ where: { conversationId: conversation.id } })).toBe(1)
  })

  it('stores it waiting while a turn runs, and leaves the turn running under Wait', async () => {
    const { person, conversation } = await conversationOf()
    const turn = await running(conversation.id)
    const result = await send(person, conversation.id)
    expect(result.queued).toBe(true)
    expect((await prisma.conversationMessage.findUniqueOrThrow({ where: { id: result.messageId } })).queueState).toBe('WAITING')
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('RUNNING')
  })

  it('stops the running turn under Interrupt, the message waiting to be taken next', async () => {
    const { person, conversation } = await conversationOf()
    await prisma.userSettings.update({ where: { userId: person.id }, data: { busyConversationMode: 'INTERRUPT' } })
    const turn = await running(conversation.id)
    const result = await send(person, conversation.id)
    expect(result.queued).toBe(true)
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('CANCELLED')
  })

  it("refuses someone who may not read the conversation, and a closed conversation", async () => {
    const { conversation } = await conversationOf()
    const stranger = await createUserWithRole('MEMBER')
    await expect(send(stranger, conversation.id)).rejects.toMatchObject({ statusCode: 404 })

    const { person, conversation: closed } = await conversationOf()
    await prisma.conversation.update({ where: { id: closed.id }, data: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } })
    await expect(send(person, closed.id)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('a waiting message @SC-945', () => {
  it('is cancelled by its sender while it waits, and is then no longer waiting', async () => {
    const { person, conversation } = await conversationOf()
    await running(conversation.id)
    const { messageId } = await send(person, conversation.id)

    await cancelWaitingConversationMessage({ conversationId: conversation.id, messageId }, ctx(person))

    expect((await prisma.conversationMessage.findUniqueOrThrow({ where: { id: messageId } })).queueState).toBe('CANCELLED')
    await expect(cancelWaitingConversationMessage({ conversationId: conversation.id, messageId }, ctx(person))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('cannot be cancelled once a turn took it', async () => {
    const { person, conversation } = await conversationOf()
    const turn = await running(conversation.id)
    const { messageId } = await send(person, conversation.id)
    await prisma.conversationMessage.update({ where: { id: messageId }, data: { queueState: 'TAKEN', turnId: turn.id } })
    await expect(cancelWaitingConversationMessage({ conversationId: conversation.id, messageId }, ctx(person))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('sent now stops the running turn', async () => {
    const { person, conversation } = await conversationOf()
    const turn = await running(conversation.id)
    const { messageId } = await send(person, conversation.id)
    await sendWaitingConversationMessageNow({ conversationId: conversation.id, messageId }, ctx(person))
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('CANCELLED')
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
  })
})

describe('Stop @SC-945', () => {
  it('stops the running turn, and is quiet when nothing runs', async () => {
    const { person, conversation } = await conversationOf()
    await stopConversationTurn({ conversationId: conversation.id }, ctx(person))
    const turn = await running(conversation.id)
    await stopConversationTurn({ conversationId: conversation.id }, ctx(person))
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('CANCELLED')
  })
})
