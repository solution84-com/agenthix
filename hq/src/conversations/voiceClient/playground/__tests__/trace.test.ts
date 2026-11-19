import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { createTraceReader } from '../trace'

const ev = (e: unknown) => e as VoiceEvent

describe('the trace line', () => {
  it('names the events that explain a decision, with the time counted from the first event', () => {
    const read = createTraceReader()
    expect(read(ev({ kind: 'acoustic.silence', silent: false, t: 5_000 }))).toBe('0.0s speaking')
    expect(read(ev({ kind: 'orchestration.phrase', tiers: ['hum', 'acknowledge'], t: 14_500 }))).toBe('9.5s asked for a sound: hum/acknowledge')
    expect(read(ev({ kind: 'phrase.skipped', why: 'no clip to play (0 stored, 0 fit)', t: 14_600 }))).toBe('9.6s no sound played: no clip to play (0 stored, 0 fit)')
    expect(read(ev({ kind: 'reply.held', replyId: 'r', t: 15_000 }))).toBe('10.0s the lead held the turn')
    expect(read(ev({ kind: 'semantics.decision', answer: 'READY', confidence: 0.97, silenceMs: 500, by: 'model', t: 15_000 }))).toBe('10.0s audio model: READY 0.97 after 500 ms')
    expect(read(ev({ kind: 'semantics.decision', answer: 'UNCERTAIN', confidence: null, silenceMs: 200, by: 'rule', t: 16_000 }))).toContain('UNCERTAIN -')
  })

  it('carries the words of a turn as sent', () => {
    const read = createTraceReader()
    expect(read(ev({ kind: 'orchestration.send', text: 'my plan is this', append: true, t: 2_000 }))).toBe('0.0s turn sent (joining the held run): my plan is this')
  })

  it('says nothing for other events and for a sound that stopped, and skips a repeat', () => {
    const read = createTraceReader()
    expect(read(ev({ kind: 'stt.utterance', text: 'hello' }))).toBeNull()
    expect(read(ev({ kind: 'phrase.at', playing: false, text: 'Mm.', t: 1 }))).toBeNull()
    expect(read(ev({ kind: 'phrase.at', playing: true, text: 'Mm.', t: 1 }))).toBe('0.0s sound playing: Mm.')
    expect(read(ev({ kind: 'phrase.at', playing: true, text: 'Mm.', t: 50 }))).toBeNull()
  })

  it('says a sound plays once, when it starts, though other lines come while it plays (the double hum) @SC-2227', () => {
    const read = createTraceReader()
    const lines = [
      ev({ kind: 'phrase.at', playing: true, text: 'Mm-hm.', lineId: 'L1', t: 23_800 }),
      ev({ kind: 'acoustic.silence', silent: true, t: 23_900 }),
      ev({ kind: 'orchestration.floor', state: 'person-pausing', t: 23_900 }),
      ev({ kind: 'phrase.at', playing: true, text: 'Mm-hm.', lineId: 'L1', t: 24_100 }),
      ev({ kind: 'phrase.at', playing: false, text: 'Mm-hm.', lineId: 'L1', t: 24_300 }),
      ev({ kind: 'phrase.at', playing: true, text: 'Mm-hm.', lineId: 'L2', t: 30_000 }),
    ].map(read).filter(Boolean)
    expect(lines).toEqual(['0.0s sound playing: Mm-hm.', '0.1s silent', '0.1s floor: person-pausing', '6.2s sound playing: Mm-hm.'])
  })

  it('names a backchannel hum, and why it came', () => {
    const read = createTraceReader()
    expect(read(ev({ kind: 'backchannel.hum', pausedMs: 600, verdict: 'UNCERTAIN', speechMs: 11_000, hum: 'sympathy', tone: 'gentle', t: 0 }))).toBe('0.0s backchannel: a sympathy gentle hum is due (paused 0.6 s, UNCERTAIN, 11.0 s of speech)')
    expect(read(ev({ kind: 'backchannel.played', text: null, why: 'a line was playing', t: 10 }))).toBe('0.0s backchannel: no hum played: a line was playing')
  })

  it('names a hum as the light model kept the turn open, and a pause with no hum @SC-2227', () => {
    const read = createTraceReader()
    expect(read(ev({ kind: 'backchannel.hum', pausedMs: 1_400, verdict: 'READY', speechMs: 5_000, notYet: true, hum: 'continuer', tone: 'calm', fallback: 'the hum service is off', t: 0 }))).toBe('0.0s backchannel: a continuer calm hum is due (stood in: the hum service is off) (paused 1.4 s, the light model said not yet, 5.0 s of speech)')
    expect(read(ev({ kind: 'backchannel.miss', why: 'after a question', pausedMs: 800, t: 0 }))).toBe('0.0s backchannel: no hum: after a question')
  })
})
