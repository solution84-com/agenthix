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
})
