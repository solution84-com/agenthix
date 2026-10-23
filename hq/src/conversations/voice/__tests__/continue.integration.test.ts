/**
 * The person speaking again before any of the reply was heard (adaptive voice spec, orchestration: Response
 * scheduler), against the real test database: the reply is cancelled and keeps none of it, the words join the
 * message it answers, marked spoken, and that message waits to be answered again; another turn holding the
 * conversation meets the person's Interrupt setting; and words for a reply already followed by another become a
 * message of their own. The speech service and model access are replaced.
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
vi.mock('../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: { async *synthesizeStream(text: string) { yield { audio: Buffer.from(text) } } },
}))

import { setUpVoiceProviders } from './voiceFixtures'
import { scheduleConversation } from '../../coordinator/scheduler'
import { appendMessage, toMessageView } from '../../store/messages'
import { resetVoiceSessions, voiceSession } from '../registry'
import { startVoice } from '../service'
import { continueVoice } from '../continue'

async function voiced() {
  await setUpVoiceProviders()
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel' })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
  await startVoice('s1', person.id, conversation.id)
  return { person, agent, conversation }
}

/** A turn that took the person's message: running (holding the conversation) or already completed. */
async function answering(conversationId: string, personId: string, state: 'RUNNING' | 'COMPLETED') {
  const turn = await prisma.inferenceTurn.create({ data: { conversationId, trigger: 'MESSAGE', state, actingUserId: personId } })
  if (state === 'RUNNING') {
    await prisma.conversation.update({ where: { id: conversationId }, data: { activeTurnId: turn.id, activeTurnLeaseUntil: new Date(Date.now() + 60_000) } })
  }
  const { message } = await appendMessage({
    conversationId, role: 'PERSON', kind: 'TEXT', body: { text: 'what about the build' }, authorId: personId, clientMessageId: `m-${turn.id}`, turnId: turn.id, spoken: true,
  })
  return { turn, message }
}

const read = async (id: string) => toMessageView(await prisma.conversationMessage.findUniqueOrThrow({ where: { id } }))

beforeEach(() => { resetVoiceSessions(); vi.mocked(scheduleConversation).mockClear() })
afterEach(() => resetVoiceSessions())

describe('continuing a message before its reply was heard', () => {
  it('joins the words after a second encouragement response as well: the first, withdrawn, is no reply that followed', async () => {
    const { person, agent, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'COMPLETED')
    const prompt = (turnId: string) => appendMessage({
      conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'Mm?' }, agentId: agent.id, turnId, encouragement: true,
    })
    await prompt(turn.id)
    await continueVoice('s1', person.id, conversation.id, turn.id, 'and the tests')
    const second = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'COMPLETED', actingUserId: person.id } })
    await prisma.conversationMessage.update({ where: { id: message.id }, data: { turnId: second.id } })
    const { message: again } = await prompt(second.id)

    await continueVoice('s1', person.id, conversation.id, second.id, 'and the deploy')

    expect(await read(message.id)).toMatchObject({ body: { text: 'what about the build and the tests and the deploy' } })
    expect(await read(again.id)).toMatchObject({ withdrawn: true })
  })

  it('joins the words after an encouragement response, keeping it whole but withdrawn, and tells the next turn', async () => {
    const { person, agent, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'COMPLETED')
    const { message: prompt } = await appendMessage({
      conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'Mm? Go on.' }, agentId: agent.id, turnId: turn.id, encouragement: true,
    })

    await continueVoice('s1', person.id, conversation.id, turn.id, 'and the tests')

    expect(await read(message.id)).toMatchObject({ body: { text: 'what about the build and the tests' }, turnId: null })
    expect(await read(prompt.id)).toMatchObject({ body: { text: 'Mm? Go on.' }, encouragement: true, withdrawn: true, interrupted: false })
    expect(voiceSession(conversation.id)?.wentOnAfter).toBe('Mm? Go on.')
  })

  it('remembers whether the words joined ended with the person mid-thought, for the turn that answers them', async () => {
    const { person, conversation } = await voiced()
    const { turn } = await answering(conversation.id, person.id, 'RUNNING')
    await continueVoice('s1', person.id, conversation.id, turn.id, 'and then we could', true)
    expect(voiceSession(conversation.id)?.trailedOff).toBe(true)
    const next = await answering(conversation.id, person.id, 'RUNNING')
    await continueVoice('s1', person.id, conversation.id, next.turn.id, 'move the launch')
    expect(voiceSession(conversation.id)?.trailedOff).toBe(false)
  })

  it('cancels the running reply, and the words join the message, which waits to be answered whole', async () => {
    const { person, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'RUNNING')

    await continueVoice('s1', person.id, conversation.id, turn.id, '  and the tests ')

    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('CANCELLED')
    const joined = await read(message.id)
    expect(joined).toMatchObject({ body: { text: 'what about the build and the tests' }, spoken: true, turnId: null, queueState: 'WAITING' })
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
  })

  it('withdraws a reply already written, keeping none of it, and answers the message again', async () => {
    const { person, agent, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'COMPLETED')
    voiceSession(conversation.id)!.speechFor(turn.id).end('COMPLETED', 'It passed. All of it.')
    const { message: reply } = await appendMessage({
      conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'It passed. All of it.' }, agentId: agent.id, turnId: turn.id,
    })

    await continueVoice('s1', person.id, conversation.id, turn.id, 'and the tests')

    expect(await read(reply.id)).toMatchObject({ body: { text: '' }, interrupted: true, withdrawn: true })
    expect(await read(message.id)).toMatchObject({ body: { text: 'what about the build and the tests' }, turnId: null, queueState: null })
  })

  it('stops another turn holding the conversation when the person interrupts', async () => {
    const { person, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'COMPLETED')
    const report = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'REPORT', state: 'RUNNING' } })
    await prisma.conversation.update({ where: { id: conversation.id }, data: { activeTurnId: report.id, activeTurnLeaseUntil: new Date(Date.now() + 60_000) } })
    await prisma.userSettings.update({ where: { userId: person.id }, data: { busyConversationMode: 'INTERRUPT' } })

    await continueVoice('s1', person.id, conversation.id, turn.id, 'and the tests')

    expect((await read(message.id)).queueState).toBe('WAITING')
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: report.id } })).state).toBe('CANCELLED')
  })

  it('words for a reply already followed by another are a message of their own', async () => {
    const { person, agent, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'COMPLETED')
    const later = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'REPORT', state: 'COMPLETED' } })
    await appendMessage({ conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'The tests passed.' }, agentId: agent.id, turnId: later.id })

    await continueVoice('s1', person.id, conversation.id, turn.id, 'and the tests')

    expect(await read(message.id)).toMatchObject({ body: { text: 'what about the build' }, turnId: turn.id })
    const own = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation.id, role: 'PERSON', id: { not: message.id } } })
    expect(toMessageView(own)).toMatchObject({ body: { text: 'and the tests' }, spoken: true, turnId: null })
  })

  it('from a socket that does not hold voice, does nothing', async () => {
    const { person, conversation } = await voiced()
    const { turn, message } = await answering(conversation.id, person.id, 'RUNNING')
    await continueVoice('s9', person.id, conversation.id, turn.id, 'and the tests')
    expect(await read(message.id)).toMatchObject({ body: { text: 'what about the build' }, turnId: turn.id })
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('RUNNING')
  })
})
