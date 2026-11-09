/**
 * A held turn and the standard acknowledgement, replayed end to end (voice that stays in the conversation, spec §1
 * "Slow or failed calls", §2 and §3): hq says the agent judged the person had not finished (`turnHeld`), so nothing is
 * played, the floor is the person's again, and their next words join the message; a reply that does not start by
 * the ceiling, because its call is slow or failed, gets one stored phrase; one that starts before it gets none.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { VOICE_SETTINGS } from '../settings'
import { script } from '../stt/__tests__/transcribing'
import { C, rig, type Rig } from './sessionRig'

const CEILING = VOICE_SETTINGS.standardAcknowledgement.ceilingMs

/** hq hands over the stored phrases as voice starts: a wait phrase of each tier, and the listening sounds. */
function phrases(r: Rig) {
  const clip = (text: string, tier: number, use: 'filler' | 'active-listening' | 'encouragement') =>
    r.receive(V.phrase, { conversationId: C, text, tier, audio: new ArrayBuffer(8), use })
  VOICE_SETTINGS.filler.steps.forEach((_, tier) => clip(`Wait ${tier}.`, tier, 'filler'))
  clip('Mm-hm.', 0, 'active-listening')
  clip('Go on.', 0, 'encouragement')
}

/** The person asks something and pauses: it goes to hq as a message. */
async function asked(adaptiveVoice = true) {
  const r = rig({ turnScores: [0.95], deps: { adaptiveVoice: () => adaptiveVoice } })
  await r.start()
  phrases(r)
  await r.hear(script([[3, 0]], 8, 300).audio)
  await r.silence(800)
  expect(r.sent()).toEqual(['w0 w1 w2'])
  return r
}

/** The person goes on: words of their own, coded apart from the first ones. */
async function goesOn(r: Rig) {
  await r.hear(script([[2, 0]], 8, 0).audio.map(x => (x === 0 ? 0 : x + 3)))
  await r.silence(1_000)
}

const playedPhrases = (r: Rig) => [...new Set(r.of('phrase.at').filter(p => p.playing).map(p => p.text))]
const continues = (r: Rig) => r.emitted.filter(e => e[0] === V.continue)

describe('a turn hq held, replayed @SC-995 @SC-1830', () => {
  it('plays nothing of it, gives the floor back, invites the person to go on, and their next words join the held message', async () => {
    const r = await asked()
    r.receive(V.turnHeld, { conversationId: C, turnId: 't1' })
    await r.advance(50)
    expect(r.session.snapshot().phase).toBe('listening')
    expect(r.of('orchestration.floor').at(-1)!.state).toBe('open')
    await r.silence(CEILING + 5_000)
    // No standard acknowledgement: only the listening family's invitation, after a few seconds of silence.
    expect(playedPhrases(r)).toEqual(['Go on.'])
    await goesOn(r)
    expect(r.sent()).toEqual(['w0 w1 w2'])
    expect(continues(r)).toEqual([[V.continue, { conversationId: C, turnId: 't1', text: 'w3 w4' }]])
  })

  it('holds whichever comes first, the turn\'s end or the hold', async () => {
    const r = await asked()
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    r.receive(V.turnHeld, { conversationId: C, turnId: 't1' })
    await r.silence(CEILING + 1_000)
    expect(playedPhrases(r)).toEqual(['Go on.'])
    await goesOn(r)
    expect(continues(r)).toEqual([[V.continue, { conversationId: C, turnId: 't1', text: 'w3 w4' }]])
  })

  it('never plays what was written before the hold', async () => {
    const r = await asked()
    r.reply('t1', ['Sure.'])
    r.receive(V.turnHeld, { conversationId: C, turnId: 't1' })
    await r.advance(200)
    expect(r.of('reply.held')).toMatchObject([{ replyId: 't1' }])
    expect(r.session.snapshot()).toMatchObject({ phase: 'listening', reveal: null })
  })

  it('still holds with the person\'s Adaptive voice off, and nothing covers the wait', async () => {
    const r = await asked(false)
    await r.silence(CEILING + 1_000)
    expect(playedPhrases(r)).toEqual([])
    r.receive(V.turnHeld, { conversationId: C, turnId: 't1' })
    await r.advance(50)
    await goesOn(r)
    expect(continues(r)).toEqual([[V.continue, { conversationId: C, turnId: 't1', text: 'w3 w4' }]])
    expect(playedPhrases(r)).toEqual([])
  })
})

describe('the standard acknowledgement, replayed @SC-995 @SC-1832', () => {
  it('is not played when the reply starts before the ceiling', async () => {
    const r = await asked()
    await r.advance(CEILING - 1_500)
    r.reply('t1', ['Let me look into the tide times.'])
    await r.advance(5_000)
    expect(playedPhrases(r)).toEqual([])
    expect(r.session.snapshot().phase).toBe('speaking')
  })

  it('plays once at the ceiling when the call is slow or failed, and the late reply follows it', async () => {
    const r = await asked()
    const sentAt = r.of('orchestration.send')[0]!.t
    await r.advance(CEILING + 20_000)
    const started = r.of('phrase.at').filter(p => p.playing)
    expect(playedPhrases(r)).toEqual(['Wait 1.'])
    expect(started[0]!.t - sentAt).toBeGreaterThanOrEqual(CEILING)
    expect(started[0]!.t - sentAt).toBeLessThan(CEILING + 100)
    r.pb.state.idle = true
    await r.advance(100)
    r.reply('t1', ['It is green.'])
    await r.advance(200)
    expect(r.session.snapshot().phase).toBe('speaking')
    expect(playedPhrases(r)).toEqual(['Wait 1.'])
  })
})

describe('the opening sentence and its echo, replayed @SC-1002 @SC-1831', () => {
  it('the agent\'s opening sentence heard back is not the person\'s words, and the rest of the reply follows', async () => {
    const opening = ['let', 'me', 'look', 'into', 'the', 'tide', 'times']
    const r = rig({ service: { textOf: i => opening[i] ?? `w${i}` } })
    await r.start()
    r.reply('t1', ['Let me look into the tide times.'])
    await r.advance(300)
    await r.hear(script([[opening.length, 0]], 8, 0).audio)
    await r.silence(3_000)
    expect(r.sent()).toEqual([])
    expect(r.interrupts()).toEqual([])
    expect(r.pb.state.stopped).toBe(0)
    r.receive(V.sentence, {
      conversationId: C, turnId: 't1', index: 1, text: 'High tide is at noon.', textStart: 33, textEnd: 54,
      words: ['High', 'tide', 'is', 'at', 'noon.'], wordStartSecs: [0, 0.3, 0.6, 0.9, 1.2], wordEndSecs: [0.25, 0.55, 0.85, 1.15, 1.45],
    })
    r.receive(V.audio, { conversationId: C, turnId: 't1', index: 1, audio: new ArrayBuffer(8) })
    await r.advance(200)
    expect(r.session.snapshot().phase).toBe('speaking')
    expect(r.pb.state.enqueued).toEqual([0, 1])
  })
})
