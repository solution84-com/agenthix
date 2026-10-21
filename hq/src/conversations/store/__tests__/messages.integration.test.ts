/**
 * The conversation's record (conversational experience spec, Data model), against the real test database:
 * messages take distinct, gapless seqs however many arrive at once, a message sent twice is stored once, and
 * what was said is encrypted at rest and readable only through the store.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation } from '../../../test/factories'
import { looksEncrypted } from '../../../server/crypto/secretCrypto'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { appendMessage, readMessages, updateMessage } from '../messages'

function personSays(conversationId: string, text: string, clientMessageId?: string) {
  return appendMessage({ conversationId, role: 'PERSON', kind: 'TEXT', body: { text }, clientMessageId: clientMessageId ?? null })
}

describe('appending a message @SC-944', () => {
  it('gives each message the next seq and moves the conversation on', async () => {
    const conversation = await createConversation()
    const first = await personSays(conversation.id, 'one')
    const second = await personSays(conversation.id, 'two')

    expect([first.message.seq, second.message.seq]).toEqual([1, 2])
    expect(second.duplicate).toBe(false)
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(row.lastSeq).toBe(2)
    expect(row.lastMessageAt.toISOString()).toBe(second.message.createdAt)
  })

  it('gives messages admitted at the same moment distinct seqs with no gaps', async () => {
    const conversation = await createConversation()
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => personSays(conversation.id, `m${i}`)))

    expect(results.map(r => r.message.seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).lastSeq).toBe(12)
  })

  it('keeps each conversation on its own count', async () => {
    const [a, b] = [await createConversation(), await createConversation()]
    await personSays(a.id, 'a1')
    await personSays(a.id, 'a2')
    expect((await personSays(b.id, 'b1')).message.seq).toBe(1)
  })

  it('stores a message sent twice once, and answers the repeat with the stored one', async () => {
    const conversation = await createConversation()
    const first = await personSays(conversation.id, 'hello', 'client-1')
    const again = await personSays(conversation.id, 'hello', 'client-1')

    expect(again).toEqual({ message: first.message, duplicate: true })
    expect(await prisma.conversationMessage.count({ where: { conversationId: conversation.id } })).toBe(1)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).lastSeq).toBe(1)
  })

  it('stores a message sent twice at the same moment once', async () => {
    const conversation = await createConversation()
    const both = await Promise.all([personSays(conversation.id, 'hi', 'c-2'), personSays(conversation.id, 'hi', 'c-2')])

    expect(both.map(r => r.duplicate).sort()).toEqual([false, true])
    expect(both[0].message.id).toBe(both[1].message.id)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).lastSeq).toBe(1)
  })

  it('refuses a conversation that does not exist', async () => {
    await expect(personSays('no-such-conversation', 'hi')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('what was said, at rest @SC-944', () => {
  it('is encrypted in the row and read back in the clear', async () => {
    const conversation = await createConversation()
    const { message } = await personSays(conversation.id, 'my salary is 123456')

    const [raw] = await prisma.$queryRaw<{ body: string }[]>`SELECT body FROM "ConversationMessage" WHERE id = ${message.id}`
    expect(raw.body).not.toContain('123456')
    expect(looksEncrypted(raw.body)).toBe(true)
    expect(message.body).toEqual({ text: 'my salary is 123456' })
    expect((await readMessages(conversation.id, { limit: 1 }))[0].body).toEqual({ text: 'my salary is 123456' })
  })
})

describe('reading messages @SC-944', () => {
  it('pages newest first, back from a seq', async () => {
    const conversation = await createConversation()
    for (const text of ['1', '2', '3', '4', '5']) await personSays(conversation.id, text)

    const latest = await readMessages(conversation.id, { limit: 2 })
    expect(latest.map(m => m.seq)).toEqual([5, 4])
    const earlier = await readMessages(conversation.id, { beforeSeq: 4, limit: 2 })
    expect(earlier.map(m => m.seq)).toEqual([3, 2])
    expect((await readMessages(conversation.id, { beforeSeq: 2, limit: 2 })).map(m => m.seq)).toEqual([1])
  })
})

describe('updating a message @SC-944', () => {
  it('records it taken from the queue, by which turn, and interrupted', async () => {
    const conversation = await createConversation()
    const { message } = await appendMessage({
      conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'wait for me' }, queueState: 'WAITING',
    })
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE' } })

    const updated = await updateMessage(message.id, { queueState: 'TAKEN', turnId: turn.id, interrupted: true })

    expect(updated).toMatchObject({ queueState: 'TAKEN', turnId: turn.id, interrupted: true, body: { text: 'wait for me' } })
  })
})
