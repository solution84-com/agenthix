/**
 * Voice in a conversation against the real test database (conversational experience spec, Voice): who may take
 * it and why not, one holder at a time, the quiet lines with how long voice was on, a restart letting every
 * holder go, a spoken message recorded as spoken only from the holder, the view's voice state, and a reply
 * spoken over after it was written cut to what was heard. The speech service and model access are replaced.
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
vi.mock('../../access/talkingModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../access/talkingModel')>()),
  resolveTalking: vi.fn(async () => ({ access: null, problem: null, offer: null })),
}))
vi.mock('../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: {
    async *synthesizeStream(text: string) { yield { audio: Buffer.from(text), wordTiming: { words: [text], wordStartSecs: [0], wordEndSecs: [1] } } },
  },
}))

import { setUpVoiceProviders } from './voiceFixtures'
import { resolveTalking } from '../../access/talkingModel'
import { getConversation } from '../../conversationQueries'
import { sendConversationMessage } from '../../sendMessage'
import { appendMessage } from '../../store/messages'
import { voiceDownText, voiceNotSetUpText } from '../../../voice/speechAccess'
import { clearVoiceHolders, HQ_RESTARTED_VOICE, releaseVoice, takeVoice } from '../holder'
import { resetVoiceSessions, voiceSession } from '../registry'
import { ENDED, endVoice, interruptVoice, startVoice, VoiceRefused } from '../service'

const providers = (which: { stt?: boolean; tts?: boolean } = {}) => setUpVoiceProviders(which)

async function voiced() {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ name: 'Kernel' })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
  return { person, agent, conversation }
}

const kinds = async (conversationId: string) =>
  (await prisma.conversationMessage.findMany({ where: { conversationId }, orderBy: { seq: 'asc' } })).map(m => m.kind)

beforeEach(() => resetVoiceSessions())
afterEach(() => resetVoiceSessions())

describe('taking voice @SC-994', () => {
  it('opens voice for a person who may speak, with the quiet line, once', async () => {
    await providers()
    const { person, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    await startVoice('s2', person.id, conversation.id)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).voiceHolderId).toBe(person.id)
    expect(await kinds(conversation.id)).toEqual(['VOICE_STARTED'])
    expect([...voiceSession(conversation.id)!.socketIds]).toEqual(['s1', 's2'])
  })

  it('refuses with the reason the greyed button shows: voice is not set up while no speech-to-text provider was added', async () => {
    // Inworld hears as well as speaks, so neither it nor AssemblyAI is there.
    await providers({ stt: false, tts: false })
    const { person, conversation } = await voiced()
    await expect(startVoice('s1', person.id, conversation.id)).rejects.toThrow(new VoiceRefused(voiceNotSetUpText('stt')))
  })

  it('says text to speech is not set up when only that was never added @SC-1667', async () => {
    await providers({ tts: false })
    const { person, conversation } = await voiced()
    await expect(startVoice('s1', person.id, conversation.id)).rejects.toThrow(new VoiceRefused(voiceNotSetUpText('tts')))
  })

  it('hears through Inworld when the AssemblyAI provider chosen is not working', async () => {
    const { stt } = await providers()
    await prisma.aiProvider.update({ where: { id: stt!.id }, data: { state: 'key_refused' } })
    const { person, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).voiceHolderId).toBe(person.id)
  })

  it('reads as voice being down when no provider that hears is working', async () => {
    const { stt, tts } = await providers()
    await prisma.aiProvider.updateMany({ where: { id: { in: [stt!.id, tts!.id] } }, data: { state: 'key_refused' } })
    const { person, conversation } = await voiced()
    await expect(startVoice('s1', person.id, conversation.id)).rejects.toThrow(new VoiceRefused(voiceDownText('stt')))
  })

  it('refuses with the model access problem when speech works but no model does', async () => {
    await providers()
    const { person, conversation } = await voiced()
    vi.mocked(resolveTalking).mockResolvedValueOnce({ access: null, problem: 'Add a model key first.', offer: null })
    await expect(startVoice('s1', person.id, conversation.id)).rejects.toThrow('Add a model key first.')
  })

  it('one person at a time: a second is told it is in use', async () => {
    const { person, conversation } = await voiced()
    const other = await createUserWithRole('MEMBER', { displayName: 'Ana' })
    expect(await takeVoice(conversation.id, other.id)).toMatchObject({ taken: true })
    expect(await takeVoice(conversation.id, person.id)).toEqual({ taken: false, holderId: other.id })
  })

  it('a person who may not read the conversation is told it does not exist', async () => {
    await providers()
    const { conversation } = await voiced()
    const stranger = await createUserWithRole('MEMBER')
    await expect(startVoice('s1', stranger.id, conversation.id)).rejects.toThrow('Conversation not found')
  })
})

describe('ending voice @SC-994', () => {
  it('writes the quiet line with how long voice was on, and why when the person did not end it', async () => {
    const { person, conversation } = await voiced()
    await takeVoice(conversation.id, person.id)
    const started = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation.id, kind: 'VOICE_STARTED' } })
    const ended = await releaseVoice(conversation.id, person.id, ENDED.silence, new Date(started.createdAt.getTime() + 240_000))
    expect(ended).toMatchObject({ kind: 'VOICE_ENDED', body: { byUserId: person.id, durationSec: 240, reason: ENDED.silence } })
    expect(await releaseVoice(conversation.id, person.id, null)).toBeNull()
  })

  it('ends what is spoken and gives voice back', async () => {
    await providers()
    const { person, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    await endVoice(conversation.id, person.id, ENDED.byPerson, null)
    expect(voiceSession(conversation.id)).toBeUndefined()
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).voiceHolderId).toBeNull()
    expect(await kinds(conversation.id)).toEqual(['VOICE_STARTED', 'VOICE_ENDED'])
  })

  it('a restart of hq lets every holder go, with the line saying why', async () => {
    const { person, conversation } = await voiced()
    await takeVoice(conversation.id, person.id)
    const ended = await clearVoiceHolders()
    expect(ended.map(e => e.message.body)).toEqual([expect.objectContaining({ byUserId: person.id, reason: HQ_RESTARTED_VOICE })])
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).voiceHolderId).toBeNull()
  })
})

describe('a spoken message @SC-995', () => {
  it('is recorded as spoken from the holder, and as typed from anyone else', async () => {
    const { person, conversation } = await voiced()
    const typed = await sendConversationMessage({ conversationId: conversation.id, clientMessageId: 'a', text: 'hi', spoken: true }, { user: person })
    await takeVoice(conversation.id, person.id)
    const spoken = await sendConversationMessage({ conversationId: conversation.id, clientMessageId: 'b', text: 'hi', spoken: true }, { user: person })
    const rows = await prisma.conversationMessage.findMany({ where: { id: { in: [typed.messageId, spoken.messageId] } } })
    expect(rows.find(r => r.id === typed.messageId)!.spoken).toBe(false)
    expect(rows.find(r => r.id === spoken.messageId)!.spoken).toBe(true)
  })
})

describe("the view's voice @SC-994", () => {
  it('says who holds voice, since when, and whether this person may take it', async () => {
    await providers()
    const { person, conversation } = await voiced()
    expect((await getConversation({ conversationId: conversation.id }, { user: person })).voice)
      .toEqual({ available: true, unavailableReason: null, holderId: null, startedAt: null })
    await takeVoice(conversation.id, person.id)
    const view = (await getConversation({ conversationId: conversation.id }, { user: person })).voice
    expect(view).toMatchObject({ available: true, holderId: person.id, startedAt: expect.any(String) })
  })
})

describe('speaking over a reply already written @SC-997', () => {
  it('cuts it in the record to the sentences heard, marked interrupted', async () => {
    await providers()
    const { person, agent, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'COMPLETED' } })
    const { message } = await appendMessage({
      conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'One. Two. Three.' }, agentId: agent.id, turnId: turn.id,
    })
    const speech = voiceSession(conversation.id)!.speechFor(turn.id)
    speech.end('COMPLETED', 'One. Two. Three.')
    speech.written(message.id)
    await interruptVoice('s1', person.id, conversation.id, turn.id, 0)
    const row = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })
    expect(row.interrupted).toBe(true)
    const { getConversationMessages } = await import('../../conversationQueries')
    const page = await getConversationMessages({ conversationId: conversation.id }, { user: person })
    expect(page.messages.find(m => m.id === message.id)!.body).toEqual({ text: 'One.' })
  })

  it('still cuts it when End follows at once and closes voice first', async () => {
    await providers()
    const { person, agent, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'COMPLETED' } })
    const { message } = await appendMessage({ conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'One. Two. Three.' }, agentId: agent.id, turnId: turn.id })
    const speech = voiceSession(conversation.id)!.speechFor(turn.id)
    speech.end('COMPLETED', 'One. Two. Three.')
    speech.written(message.id)
    // The browser sends both at once; End's handler closes the session while the interruption checks the speaking rule.
    await Promise.all([
      interruptVoice('s1', person.id, conversation.id, turn.id, 0),
      endVoice(conversation.id, person.id, ENDED.byPerson, null),
    ])
    expect(voiceSession(conversation.id)).toBeUndefined()
    const row = await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })
    expect(row.interrupted).toBe(true)
    const { getConversationMessages } = await import('../../conversationQueries')
    const page = await getConversationMessages({ conversationId: conversation.id }, { user: person })
    expect(page.messages.find(m => m.id === message.id)!.body).toEqual({ text: 'One.' })
  })

  it('leaves a reply voice did not speak as it is', async () => {
    await providers()
    const { person, agent, conversation } = await voiced()
    await startVoice('s1', person.id, conversation.id)
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'COMPLETED' } })
    const { message } = await appendMessage({ conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'A. B.' }, agentId: agent.id, turnId: turn.id })
    await interruptVoice('s1', person.id, conversation.id, turn.id, -1)
    expect((await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })).interrupted).toBe(false)
  })

  it('from a socket that does not hold voice, does nothing', async () => {
    const { person, agent, conversation } = await voiced()
    const turn = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'COMPLETED' } })
    const { message } = await appendMessage({ conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: 'A. B.' }, agentId: agent.id, turnId: turn.id })
    await interruptVoice('s9', person.id, conversation.id, turn.id, -1)
    expect((await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })).interrupted).toBe(false)
  })
})
