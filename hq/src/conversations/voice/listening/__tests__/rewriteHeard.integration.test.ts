/**
 * The stored agent message a skipped line is taken out of (adaptive voice listening, spec §What is stored), against the
 * real test database: a reply's message found by its id, a turn closed alone found by its turn, and nothing written
 * when the edit leaves the text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})

import { rewriteAgentText } from '../rewriteHeard'
import { recordLightTurn } from '../lightTurn'
import { appendMessage, readMessages } from '../../../store/messages'

const access = { model: '~deepseek/deepseek-flash-latest', providerId: 'p-light' }

async function setUp() {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel' })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id, voiceHolderId: person.id })
  return { person, agent, conversation }
}

async function agentText(conversationId: string): Promise<string[]> {
  const messages = (await readMessages(conversationId, { limit: 10 })).reverse()
  return messages.filter(m => m.role === 'AGENT' && m.kind === 'TEXT').map(m => (m.kind === 'TEXT' ? m.body.text : ''))
}

describe('taking a skipped line out of a stored agent message @SC-2216', () => {
  beforeEach(async () => { await prisma.inferenceTurn.deleteMany() })
  afterEach(() => vi.restoreAllMocks())

  it("edits a reply's message, found by its id, given the text as stored", async () => {
    const { agent, conversation } = await setUp()
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, state: 'COMPLETED', trigger: 'MESSAGE' } })
    const { message } = await appendMessage({
      conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'Mm-hm. Let me look.\n\nIt is sunny.' },
      agentId: agent.id, turnId: turn.id,
    })
    const seen: string[] = []
    const edited = await rewriteAgentText(conversation.id, { turnId: turn.id, messageId: message.id }, text => {
      seen.push(text)
      return 'Let me look.\n\nIt is sunny.'
    })
    expect(seen).toEqual(['Mm-hm. Let me look.\n\nIt is sunny.'])
    expect(edited).toMatchObject({ id: message.id, role: 'AGENT', kind: 'TEXT', body: { text: 'Let me look.\n\nIt is sunny.' } })
    expect(await agentText(conversation.id)).toEqual(['Let me look.\n\nIt is sunny.'])
  })

  it('finds the agent message of a turn closed alone by its turn', async () => {
    const { person, conversation } = await setUp()
    const turnId = await recordLightTurn(
      { conversationId: conversation.id, holderId: person.id, message: 'Okay, thanks.', agentText: 'Mm-hm. You are welcome.', access },
      { message: vi.fn(), turn: vi.fn() },
    )
    const edited = await rewriteAgentText(conversation.id, { turnId, messageId: null }, () => 'You are welcome.')
    expect(edited).toMatchObject({ role: 'AGENT', kind: 'TEXT', turnId, body: { text: 'You are welcome.' } })
    expect(await agentText(conversation.id)).toEqual(['You are welcome.'])
    // The person's message of that turn is untouched.
    const spoken = (await readMessages(conversation.id, { limit: 10 })).find(m => m.role === 'PERSON')
    expect(spoken?.kind === 'TEXT' ? spoken.body.text : null).toBe('Okay, thanks.')
  })

  it('writes nothing when the edit leaves the text, or when there is no such message', async () => {
    const { person, conversation } = await setUp()
    const turnId = await recordLightTurn(
      { conversationId: conversation.id, holderId: person.id, message: 'Thanks.', agentText: 'Any time.', access },
      { message: vi.fn(), turn: vi.fn() },
    )
    const before = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation.id, role: 'AGENT' } })
    expect(await rewriteAgentText(conversation.id, { turnId, messageId: null }, () => null)).toBeNull()
    expect(await rewriteAgentText(conversation.id, { turnId, messageId: null }, text => text)).toBeNull()
    expect(await rewriteAgentText(conversation.id, { turnId: 'no-such-turn', messageId: null }, () => 'x')).toBeNull()
    const after = await prisma.conversationMessage.findFirstOrThrow({ where: { id: before.id } })
    expect(after.body).toBe(before.body)
  })
})
