/**
 * The one-turn lock and the durable queue (conversation layer spec, Inference turn; A message while a reply
 * streams), against the real test database: two claims at once give one turn; a turn takes the oldest messages
 * by one author and marks them taken; a lock whose lease ran out passes on, its turn failed; a conversation's
 * turns run one after another, the waiting message answered after the running one.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { appendMessage, readMessages } from '../../store/messages'
import { claimNextTurn, HQ_RESTARTED } from '../claim'
import { claimLock, TURN_LEASE_MS } from '../lock'
import { driveConversation, turnDeps } from '../scheduler'
import type { TurnDeps } from '../turn'
import type { LeadStreamEvent } from '../../contract'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

async function conversationOf() {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id })
  return { person, conversation }
}

const says = (conversationId: string, authorId: string, text: string, queueState: 'WAITING' | null = null) =>
  appendMessage({ conversationId, role: 'PERSON', kind: 'TEXT', body: { text }, authorId, clientMessageId: `${text}-${Math.random()}`, queueState })

describe('claiming a turn @SC-946', () => {
  it('gives one turn to two claims made at once', async () => {
    const { person, conversation } = await conversationOf()
    await says(conversation.id, person.id, 'hello')

    const results = await Promise.all([claimNextTurn(conversation.id), claimNextTurn(conversation.id)])

    expect(results.filter(r => r.claimed !== null)).toHaveLength(1)
    expect(await prisma.inferenceTurn.count({ where: { conversationId: conversation.id } })).toBe(1)
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(row.activeTurnId).toBe(results.find(r => r.claimed)!.claimed!.turnId)
  })

  it('holds against a second claim of the lock until its lease runs out', async () => {
    const { conversation } = await conversationOf()
    const now = new Date()
    const t1 = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'RUNNING' } })
    const t2 = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'RUNNING' } })
    expect(await claimLock(prisma, conversation.id, t1.id, now)).toBe(true)
    expect(await claimLock(prisma, conversation.id, t2.id, now)).toBe(false)
    expect(await claimLock(prisma, conversation.id, t2.id, new Date(now.getTime() + TURN_LEASE_MS + 1))).toBe(true)
  })

  it('takes the oldest messages by one author, and marks the waiting ones taken', async () => {
    const { person, conversation } = await conversationOf()
    const other = await createUserWithRole('MEMBER')
    const a = await says(conversation.id, person.id, 'one')
    const b = await says(conversation.id, person.id, 'two', 'WAITING')
    await says(conversation.id, other.id, 'three', 'WAITING')

    const { claimed } = await claimNextTurn(conversation.id)

    expect(claimed).toMatchObject({ actingUserId: person.id, inputIds: [a.message.id, b.message.id] })
    const rows = await prisma.conversationMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { seq: 'asc' } })
    expect(rows.map(r => [r.turnId, r.queueState])).toEqual([[claimed!.turnId, null], [claimed!.turnId, 'TAKEN'], [null, 'WAITING']])
    const turn = await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: claimed!.turnId } })
    expect(turn).toMatchObject({ state: 'RUNNING', trigger: 'MESSAGE', actingUserId: person.id })
    expect(turn.createdAt.toISOString()).toBe(a.message.createdAt)
  })

  it('never takes a cancelled message, and claims nothing when nothing waits', async () => {
    const { person, conversation } = await conversationOf()
    await says(conversation.id, person.id, 'gone', 'WAITING')
    await prisma.conversationMessage.updateMany({ where: { conversationId: conversation.id }, data: { queueState: 'CANCELLED' } })
    expect((await claimNextTurn(conversation.id)).claimed).toBeNull()
  })

  it('fails the turn of a lock whose lease ran out, and passes the lock on', async () => {
    const { person, conversation } = await conversationOf()
    const dead = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'RUNNING', agentId: conversation.agentId } })
    await prisma.conversation.update({ where: { id: conversation.id }, data: { activeTurnId: dead.id, activeTurnLeaseUntil: new Date(Date.now() - 1_000) } })
    await says(conversation.id, person.id, 'again')

    const { claimed, abandoned } = await claimNextTurn(conversation.id)

    expect(abandoned).toMatchObject({ kind: 'FAILED', body: { reason: HQ_RESTARTED }, turnId: dead.id })
    expect(await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: dead.id } })).toMatchObject({ state: 'FAILED', error: HQ_RESTARTED })
    expect(claimed).not.toBeNull()
  })
})

describe('running a conversation @SC-946', () => {
  function deps(replies: string[]): TurnDeps {
    return {
      ...turnDeps,
      async resolveAccess() { return { access: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', owner: 'user', kind: 'API_KEY' }, problem: null, offer: null } },
      async fixTalkingAccess() { return true },
      async titleConversation() {},
      async mint({ turnId, actingUserId }) { return turnCapability({ turnId, actingUserId }) },
      tools: { async toolsFor() { return [] }, async call() { return { status: 'refused', reason: 'none' } } },
      async context() { return { system: [{ text: 'base' }], messages: [{ role: 'user', content: 'x' }] } },
      model: {
        async *stream(): AsyncGenerator<LeadStreamEvent> {
          yield { type: 'text', text: replies.shift() ?? '' }
          yield { type: 'finish', reason: 'stop', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }
        },
        async complete() { throw new Error('not used') },
      },
    }
  }

  it('answers each run of messages in its own turn, in order, and releases the lock', async () => {
    const { person, conversation } = await conversationOf()
    const other = await createUserWithRole('MEMBER')
    await says(conversation.id, person.id, 'first')
    await says(conversation.id, other.id, 'second', 'WAITING')

    await driveConversation(conversation.id, deps(['one', 'two']))

    const thread = (await readMessages(conversation.id, { limit: 10 })).reverse()
    expect(thread.map(m => (m.body as { text?: string }).text)).toEqual(['first', 'second', 'one', 'two'])
    const turns = await prisma.inferenceTurn.findMany({ where: { conversationId: conversation.id }, orderBy: { startedAt: 'asc' } })
    expect(turns.map(t => [t.state, t.actingUserId])).toEqual([['COMPLETED', person.id], ['COMPLETED', other.id]])
    expect(turns[0]).toMatchObject({ model: 'claude-sonnet-5', inputTokens: 1, outputTokens: 1 })
    expect(turns[0]!.endedAt).not.toBeNull()
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).activeTurnId).toBeNull()
  })
})
