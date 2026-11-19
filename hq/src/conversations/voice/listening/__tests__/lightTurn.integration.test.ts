/**
 * A turn the light model closes alone is a real turn (adaptive voice listening, spec §When a turn ends; plan task 3.5),
 * against the real test database: one completed turn on the light model, the person's spoken message attached to it so
 * no claim takes it, the lines they heard stored as its agent message, the screens told as for any reply. And the
 * recap is stored on the conversation and read back by the listening call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})

import { recordLightTurn } from '../lightTurn'
import { listeningContext } from '../reads'
import { claimNextTurn } from '../../../coordinator/claim'
import { readMessages } from '../../../store/messages'

const access = { model: '~deepseek/deepseek-flash-latest', providerId: 'p-light' }

async function setUp() {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel' })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id, voiceHolderId: person.id })
  return { person, agent, conversation }
}

describe('a turn the light model closes alone @SC-2214', () => {
  beforeEach(async () => { await prisma.inferenceTurn.deleteMany() })
  afterEach(() => vi.restoreAllMocks())

  it('is one completed turn, with the spoken message and what was heard as its agent message', async () => {
    const { person, agent, conversation } = await setUp()
    const events = { message: vi.fn(), turn: vi.fn() }
    const turnId = await recordLightTurn({
      conversationId: conversation.id, holderId: person.id, message: 'Okay, thanks.', agentText: 'Mm-hm. You are welcome.', access,
      usage: { inputTokens: 900, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }, events)

    const turn = await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turnId } })
    expect(turn).toMatchObject({
      state: 'COMPLETED', trigger: 'MESSAGE', actingUserId: person.id, agentId: agent.id, model: access.model, providerId: access.providerId,
      inputTokens: 900, outputTokens: 20,
    })
    expect(turn.endedAt).not.toBeNull()

    const messages = (await readMessages(conversation.id, { limit: 10 })).reverse()
    expect(messages.map(m => [m.role, m.kind, m.kind === 'TEXT' ? m.body.text : null, m.turnId])).toEqual([
      ['PERSON', 'TEXT', 'Okay, thanks.', turnId],
      ['AGENT', 'TEXT', 'Mm-hm. You are welcome.', turnId],
    ])
    expect(messages[0]!.spoken).toBe(true)
    expect(events.message).toHaveBeenCalledTimes(2)
    expect(events.turn).toHaveBeenLastCalledWith({ conversationId: conversation.id, turnId, state: 'COMPLETED' })
  })

  it('is never answered again: no claim takes its message, and the lock stays free', async () => {
    const { person, conversation } = await setUp()
    await recordLightTurn({ conversationId: conversation.id, holderId: person.id, message: 'Thanks.', agentText: 'Any time.', access }, { message: vi.fn(), turn: vi.fn() })
    const { claimed } = await claimNextTurn(conversation.id)
    expect(claimed).toBeNull()
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(row.activeTurnId).toBeNull()
  })

  it("carries the last heavy turn's context size, so compaction's marks still read it", async () => {
    const { person, conversation } = await setUp()
    await prisma.inferenceTurn.create({
      data: { conversationId: conversation.id, state: 'COMPLETED', trigger: 'MESSAGE', contextTokens: 42_000, endedAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 2000) },
    })
    const turnId = await recordLightTurn({ conversationId: conversation.id, holderId: person.id, message: 'Hi.', agentText: 'Hi there.', access }, { message: vi.fn(), turn: vi.fn() })
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turnId } })).contextTokens).toBe(42_000)
  })
})

describe('what the listening call reads @SC-2202', () => {
  it('the recap stored on the conversation, the last exchanges oldest first, and who is who', async () => {
    const { person, conversation } = await setUp()
    await recordLightTurn({ conversationId: conversation.id, holderId: person.id, message: 'Hi.', agentText: 'Hi, Sam.', access }, { message: vi.fn(), turn: vi.fn() })
    await recordLightTurn({ conversationId: conversation.id, holderId: person.id, message: 'Thanks.', agentText: 'Any time.', access }, { message: vi.fn(), turn: vi.fn() })
    await prisma.conversation.update({ where: { id: conversation.id }, data: { voiceRecap: 'Sam said hello.' } })

    const ctx = await listeningContext({ conversationId: conversation.id, holderId: person.id }, 3)
    expect(ctx.agent).toBe('Kernel')
    expect(ctx.person).not.toBe('the person')
    expect(ctx.recap).toBe('Sam said hello.')
    expect(ctx.exchanges).toEqual([
      { who: 'agent', text: 'Hi, Sam.' }, { who: 'person', text: 'Thanks.' }, { who: 'agent', text: 'Any time.' },
    ])
  })
})
