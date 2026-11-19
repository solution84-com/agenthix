/**
 * Plain voice under the flag `voiceListener` (adaptive voice listening, spec §Adaptive voice), replayed end to end:
 * Adaptive voice off, or no light model (an answer saying `off`), is plain voice — the turn ends on sound, nothing is
 * said until the reply; and with the flag off, voice is today's.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '@agenthix/core'
import { VOICE_SETTINGS } from '../settings'
import { lightRig, speech, type LightRig } from './lightRig'
import { C } from './sessionRig'

describe('plain voice', () => {
  const phrases = (r: LightRig) => {
    r.receive(V.phrase, { conversationId: C, text: 'Wait.', tier: 1, audio: new ArrayBuffer(8), use: 'filler' })
    r.receive(V.phrase, { conversationId: C, text: 'Mm-hm.', tier: 0, audio: new ArrayBuffer(8), use: 'active-listening' })
    r.receive(V.phrase, { conversationId: C, text: 'Go on.', tier: 0, audio: new ArrayBuffer(8), use: 'encouragement' })
  }

  it('the flag on with Adaptive voice off: no call, the turn ends on sound as today, nothing said, no trailed off @SC-2218', async () => {
    const r = lightRig({ adaptiveVoice: false, turnScores: [0.1] })
    await r.start()
    phrases(r)
    await r.hear(speech(5))
    await r.silence(VOICE_SETTINGS.pause.capMs + 10_000)
    expect(r.listens()).toEqual([])
    expect(r.sendMessage.mock.calls.map(c => c[0])).toEqual([expect.not.objectContaining({ trailedOff: true })])
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4'])
    expect(r.of('phrase.at')).toEqual([])
  })

  it('an answer saying off: the message it carried was taken, and from then on voice is plain @SC-2218', async () => {
    const r = lightRig()
    await r.start()
    phrases(r)
    await r.hear(speech(3))
    await r.silence(1_200)
    r.listens().forEach(l => r.answer({ seq: l.seq, off: true, ...(l.moment === 'soundsFinished' && { turn: 'handedOver' }) }))
    await r.advance(50)
    const asked = r.listens().length
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    await r.advance(50)
    await r.hear(speech(2, 10))
    await r.silence(VOICE_SETTINGS.pause.capMs + 5_000)
    expect(r.listens()).toHaveLength(asked)
    expect(r.sent()).toEqual(['w10 w11'])
    expect(r.of('phrase.at')).toEqual([])
  })

  it('the flag off: no call, and the listening family and the standard acknowledgement are today\'s @SC-2219', async () => {
    const r = lightRig({ voiceListener: false })
    await r.start()
    phrases(r)
    await r.hear(speech(5))
    await r.silence(VOICE_SETTINGS.standardAcknowledgement.ceilingMs + 2_000)
    expect(r.listens()).toEqual([])
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4'])
    expect(r.of('phrase.at').some(e => e.text === 'Wait.')).toBe(true)
  })
})
