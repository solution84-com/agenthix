/**
 * The turns cards cause (conversation layer spec, A completion while a reply streams; Authorised automatic
 * continuation), against the real test database: a person's message is answered before any card; several cards
 * are one report turn, acting for no one, which marks them taken; a continuation takes the report's place when its
 * check passes and not when it fails; the reply's first line is the reader's notification, and a reply that could
 * say nothing leaves each card's own line.
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

import { sealJson, sealText } from '../../sealing'
import { appendMessage } from '../../store/messages'
import { claimNextTurn } from '../claim'
import { createMailbox } from '../mailbox'
import { notifyCard } from '../notify'
import { driveConversation, turnDeps } from '../scheduler'
import type { TurnDeps } from '../turn'
import type { ContinuationObligation } from '../../../shared/conversations/protocol'
import type { LeadStreamEvent } from '../../contract'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

const quiet = { message: vi.fn(), messageUpdated: vi.fn(), delta: vi.fn(), turn: vi.fn(), operation: vi.fn(), operationLines: vi.fn() }
const mailbox = createMailbox({ schedule: () => {}, notify: notifyCard, events: quiet })

async function conversationOf() {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id })
  return { person, conversation }
}

async function ended(conversationId: string, authorisedById: string, continuation: ContinuationObligation | null = null, title = 'Review the README') {
  const op = await prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: `k-${Math.random()}`,
      state: 'COMPLETED', title: sealText(title), authorisedById, resultSummary: sealJson({ summary: 'Found 3 issues', stated: true }),
      ...(continuation ? { continuation } : {}),
    } as never,
  })
  await mailbox.operationEnded(op.id)
  return op
}

const then = (by: string, depth = 1): ContinuationObligation => ({ authorisedById: by, authorisingTurnId: 't0', nextStep: 'open a task for each', depth })

describe('claiming the turn cards cause @SC-962', () => {
  it('answers a person\'s message before any card', async () => {
    const { person, conversation } = await conversationOf()
    await ended(conversation.id, person.id)
    await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'hi' }, authorId: person.id, clientMessageId: 'c1' })

    const { claimed } = await claimNextTurn(conversation.id)
    expect(claimed).toMatchObject({ trigger: 'MESSAGE', actingUserId: person.id })
  })

  it('makes one report turn of several cards, acting for no one, and marks them taken by it', async () => {
    const { person, conversation } = await conversationOf()
    await ended(conversation.id, person.id)
    await ended(conversation.id, person.id, null, 'Profile the pipeline')

    const { claimed } = await claimNextTurn(conversation.id)

    expect(claimed).toMatchObject({ trigger: 'REPORT', actingUserId: null })
    expect(claimed!.inputIds).toHaveLength(2)
    const turn = await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: claimed!.turnId } })
    expect(turn).toMatchObject({ trigger: 'REPORT', actingUserId: null })
    const cards = await prisma.conversationMessage.findMany({ where: { conversationId: conversation.id, kind: 'RESULT' } })
    expect(cards.every(c => c.turnId === claimed!.turnId && !c.awaitsTurn)).toBe(true)
  })

  it('continues in place of the report when the check passes, as the person who authorised it @SC-963', async () => {
    const { person, conversation } = await conversationOf()
    const op = await ended(conversation.id, person.id, then(person.id, 2))

    const { claimed } = await claimNextTurn(conversation.id, new Date(), () => async () => true)

    expect(claimed).toMatchObject({
      trigger: 'CONTINUATION', actingUserId: person.id, continuationDepth: 2,
      continuations: [{ operationId: op.id, nextStep: 'open a task for each' }],
    })
  })

  it('reports instead when the person may no longer speak in the conversation', async () => {
    const { person, conversation } = await conversationOf()
    await ended(conversation.id, person.id, then(person.id))
    await prisma.user.update({ where: { id: person.id }, data: { deactivatedAt: new Date() } })

    const { claimed } = await claimNextTurn(conversation.id)
    expect(claimed).toMatchObject({ trigger: 'REPORT', actingUserId: null })
  })

  it('takes each card once when two claims race: one turn, never both a report and a continuation', async () => {
    const { person, conversation } = await conversationOf()
    await ended(conversation.id, person.id, then(person.id))
    await ended(conversation.id, person.id, null, 'Profile the pipeline')

    const results = await Promise.all([
      claimNextTurn(conversation.id, new Date(), () => async () => true),
      claimNextTurn(conversation.id, new Date(), () => async () => true),
    ])

    const claimed = results.map(r => r.claimed).filter(c => c !== null)
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({ trigger: 'CONTINUATION', actingUserId: person.id })
    expect(await prisma.inferenceTurn.count({ where: { conversationId: conversation.id } })).toBe(1)
    const cards = await prisma.conversationMessage.findMany({ where: { conversationId: conversation.id, kind: 'RESULT' } })
    expect(cards.every(c => c.turnId === claimed[0]!.turnId && !c.awaitsTurn)).toBe(true)
  })
})

describe('the notification after a report @SC-962', () => {
  function deps(reply: string | null): TurnDeps {
    return {
      ...turnDeps,
      async titleConversation() {},
      async resolveAccess() {
        return reply === null
          ? { access: null, problem: 'There is no model access to talk on here.', offer: null }
          : { access: { provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', owner: 'user', kind: 'API_KEY' }, problem: null, offer: null }
      },
      async fixTalkingAccess() { return true },
      async mint({ turnId, actingUserId, trigger }) { return turnCapability({ turnId, actingUserId, trigger }) },
      tools: { async toolsFor() { return [] }, async call() { return { status: 'refused', reason: 'none' } } },
      async context() { return { system: [{ text: 'base' }], messages: [{ role: 'user', content: 'x' }] } },
      model: {
        async *stream(): AsyncGenerator<LeadStreamEvent> {
          yield { type: 'text', text: reply ?? '' }
          yield { type: 'finish', reason: 'stop', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }
        },
        async complete() { throw new Error('not used') },
      },
    }
  }

  it('carries the reply\'s first line to the reader, once, linked to the conversation', async () => {
    const { person, conversation } = await conversationOf()
    const op = await ended(conversation.id, person.id)

    await driveConversation(conversation.id, deps('The README review is back: three issues.\nThe worst is…'))
    await driveConversation(conversation.id, deps('again'))

    const notes = await prisma.notification.findMany({ where: { userId: person.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      type: 'conversation_result', title: expect.any(String), body: 'The README review is back: three issues.',
      conversationId: conversation.id, operationId: op.id, actionUrl: `/chat/t/${conversation.id}`,
    })
  })

  it('carries the result\'s own line when no reply can run', async () => {
    const { person, conversation } = await conversationOf()
    await ended(conversation.id, person.id)

    await driveConversation(conversation.id, deps(null))

    const notes = await prisma.notification.findMany({ where: { userId: person.id } })
    expect(notes.map(n => n.body)).toEqual(['Review the README · Found 3 issues'])
  })
})
