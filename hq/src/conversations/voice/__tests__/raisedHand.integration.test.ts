/**
 * An agent's raised hand while someone holds voice (adaptive voice spec, orchestration: Hand-raise), against the
 * real test database: a result that would take a report turn waits, and the agent raises its hand instead; the
 * holder's invitation lets it take its turn; the person's own message is never held; and voice ending lets the
 * update take its turn as text. The speech service and model access are replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))
vi.mock('../../access/conversationAccess', () => ({
  resolveConversationAccess: vi.fn(async () => ({ access: null, problem: null, offer: null })),
}))
vi.mock('../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: { async *synthesizeStream(text: string) { yield { audio: Buffer.from(text) } } },
}))

import { encryptProviderKey } from '../../../server/providerService'
import { claimNextTurn } from '../../coordinator/claim'
import { continuationCheck } from '../../coordinator/continuationChecks'
import { scheduleConversation } from '../../coordinator/scheduler'
import { appendMessage } from '../../store/messages'
import { listeningSession, resetVoiceSessions, turnVoice } from '../registry'
import { ENDED, endVoice, inviteVoice, startVoice } from '../service'

async function voiced() {
  await prisma.provider.create({ data: { service: 'stt', name: 'assemblyai', apiKey: encryptProviderKey('stt-key') } })
  await prisma.provider.create({ data: { service: 'tts', name: 'inworld', apiKey: encryptProviderKey('tts-key') } })
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel', voiceEnabled: true })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
  await startVoice('s1', person.id, conversation.id)
  return { person, conversation }
}

async function resultCard(conversationId: string) {
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'RESULT', clientMessageId: `result:${Math.random()}`,
    body: { title: 'Review the README', summary: 'Found 3 issues', outcome: 'completed' } as never,
  })
  await prisma.conversationMessage.update({ where: { id: message.id }, data: { awaitsTurn: true } })
  return message
}

const claim = (conversationId: string) => claimNextTurn(conversationId, new Date(), continuationCheck, id => turnVoice.holdsCards(id))

beforeEach(() => { resetVoiceSessions(); vi.mocked(scheduleConversation).mockClear() })
afterEach(() => resetVoiceSessions())

describe('a raised hand while someone holds voice', () => {
  it('holds a result that would take a report turn, until the holder invites it', async () => {
    const { person, conversation } = await voiced()
    const card = await resultCard(conversation.id)

    const held = await claim(conversation.id)
    expect(held.claimed).toBeNull()
    expect(held.held).toEqual({ updateId: card.id, critical: false })
    expect((await prisma.conversationMessage.findUniqueOrThrow({ where: { id: card.id } })).turnId).toBeNull()

    turnVoice.raiseHand(conversation.id, held.held!)
    inviteVoice('s1', person.id, conversation.id, card.id)
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
    const { claimed } = await claim(conversation.id)
    expect(claimed).toMatchObject({ trigger: 'REPORT', inputIds: [card.id] })
  })

  it("never holds the person's own message, which is answered first", async () => {
    const { person, conversation } = await voiced()
    await resultCard(conversation.id)
    await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'hi' }, authorId: person.id, clientMessageId: 'c1' })
    const { claimed, held } = await claim(conversation.id)
    expect(claimed).toMatchObject({ trigger: 'MESSAGE', actingUserId: person.id })
    expect(held).toBeUndefined()
  })

  it('an invitation from a socket that does not hold voice, or for another update, does nothing', async () => {
    const { person, conversation } = await voiced()
    const card = await resultCard(conversation.id)
    turnVoice.raiseHand(conversation.id, (await claim(conversation.id)).held!)
    inviteVoice('s9', person.id, conversation.id, card.id)
    inviteVoice('s1', person.id, conversation.id, 'another')
    expect(scheduleConversation).not.toHaveBeenCalled()
    expect((await claim(conversation.id)).claimed).toBeNull()
  })

  it('voice ending with the hand raised lets the update take its turn, as text', async () => {
    const { person, conversation } = await voiced()
    const card = await resultCard(conversation.id)
    turnVoice.raiseHand(conversation.id, (await claim(conversation.id)).held!)
    await endVoice(conversation.id, person.id, ENDED.byPerson, null)
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
    const { claimed } = await claim(conversation.id)
    expect(claimed).toMatchObject({ trigger: 'REPORT', inputIds: [card.id] })
    expect(listeningSession(conversation.id, claimed!)).toBeNull()
  })
})
