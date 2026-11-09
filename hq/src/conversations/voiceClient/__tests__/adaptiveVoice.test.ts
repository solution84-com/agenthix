/**
 * The person's Adaptive voice, replayed end to end (voice that stays in the conversation, spec §1): the same
 * conversation with the switch on and off. Off, the agent says nothing until its reply starts (no standard
 * acknowledgement, no listening sound); the turn model still ends the turn, and the reply still plays.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { VOICE_SETTINGS } from '../settings'
import { script } from '../stt/__tests__/transcribing'
import { C, rig, type Rig } from './sessionRig'

/** hq hands over the stored phrases as voice starts: a wait phrase of each tier, and the listening sounds. */
function phrases(r: Rig) {
  const clip = (text: string, tier: number, use: 'filler' | 'active-listening' | 'encouragement') =>
    r.receive(V.phrase, { conversationId: C, text, tier, audio: new ArrayBuffer(8), use })
  VOICE_SETTINGS.filler.steps.forEach((_, tier) => clip(`Wait ${tier}.`, tier, 'filler'))
  clip('Mm-hm.', 0, 'active-listening')
  clip('Go on.', 0, 'encouragement')
}

/** A question, a pause long enough for any rule to end it, then a long wait for the reply, which then plays. */
async function conversation(adaptiveVoice: boolean) {
  const r = rig({ turnScores: [0.95], deps: { adaptiveVoice: () => adaptiveVoice } })
  await r.start()
  phrases(r)
  await r.hear(script([[5, 0]], 8, 300).audio)
  await r.silence(VOICE_SETTINGS.pause.capMs + 1_000)
  await r.advance(20_000)
  // Whatever wait phrase is playing ends, so the reply is not held behind it.
  r.pb.state.idle = true
  await r.advance(100)
  r.reply('t1', ['It is green.'])
  await r.advance(200)
  return r
}

const lastSilenceAt = (r: Rig) => r.of('acoustic.silence').filter(e => e.silent).at(-1)!.t

describe('the person\'s Adaptive voice, replayed @SC-995 @SC-1834', () => {
  it('on: the turn model ends the turn, and the standard acknowledgement covers the long wait', async () => {
    const r = await conversation(true)
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4'])
    expect(r.asked()).toBe(1)
    expect(r.of('semantics.decision').find(d => d.answer === 'READY')).toMatchObject({ by: 'model' })
    expect([...new Set(r.of('phrase.at').filter(p => p.playing).map(p => p.text))]).toEqual(['Wait 1.'])
    expect(r.session.snapshot().phase).toBe('speaking')
  })

  it('off: no standard acknowledgement; the turn model still ends the turn, and the reply still plays', async () => {
    const r = await conversation(false)
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4'])
    expect(r.asked()).toBe(1)
    expect(r.of('semantics.decision').find(d => d.answer === 'READY')).toMatchObject({ by: 'model' })
    expect(r.of('orchestration.send')[0]!.t - lastSilenceAt(r)).toBeLessThan(VOICE_SETTINGS.pause.capMs)
    expect(r.of('phrase.at')).toEqual([])
    expect(r.of('orchestration.phrase')).toEqual([])
    expect(r.session.snapshot().phase).toBe('speaking')
  })

  it('is read as voice starts: the session runs on the person\'s value', async () => {
    const off = await conversation(false)
    expect(off.session.runtime()?.settings().adaptiveVoice).toBe(false)
    const on = await conversation(true)
    expect(on.session.runtime()?.settings().adaptiveVoice).toBe(true)
  })
})
