import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import type { VoiceEventInput } from '../../events'
import { pauseTimer } from '../pause'

function setup() {
  const clock = fakeClock()
  const runtime = createVoiceRuntime({ components: [pauseTimer], adapters: [], settings: VOICE_SETTINGS, clock, tickMs: 50 })
  const asks: number[] = []
  const decisions: Array<{ answer: string; confidence: number | null; silenceMs: number; by: string }> = []
  runtime.subscribe(['semantics.ask'], e => asks.push(e.silenceMs))
  runtime.subscribe(['semantics.decision'], e => decisions.push({ answer: e.answer, confidence: e.confidence, silenceMs: e.silenceMs, by: e.by }))
  runtime.start()
  const send = (event: VoiceEventInput) => runtime.publish(event)
  const silent = (s: boolean) => send({ kind: 'acoustic.silence', silent: s, t: clock.now() })
  const score = (value: number) => send({ kind: 'semantics.score', score: value, silenceMs: 200, t: clock.now() })
  return { clock, asks, decisions, send, silent, score }
}

describe('the pause timer and the decision rule @SC-995', () => {
  it('asks the turn model once, at 200 ms of silence', () => {
    const c = setup()
    c.silent(false)
    c.silent(true)
    c.clock.advance(150)
    expect(c.asks).toEqual([])
    c.clock.advance(50)
    expect(c.asks).toEqual([200])
    c.clock.advance(2_000)
    expect(c.asks).toHaveLength(1)
  })

  it('does not count silence before the person has spoken', () => {
    const c = setup()
    c.silent(true)
    c.clock.advance(5_000)
    expect(c.asks).toEqual([])
    expect(c.decisions).toEqual([])
  })

  it('applies the one score at 0.5 s: a finished question is READY', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.score(0.95)
    c.clock.advance(300)
    expect(c.decisions).toEqual([{ answer: 'READY', confidence: 0.95, silenceMs: 500, by: 'model' }])
    c.clock.advance(5_000)
    expect(c.decisions).toHaveLength(1)
  })

  it('walks the marks for a middling score: UNCERTAIN at 0.5 s and 1 s, READY at 2 s', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.score(0.6)
    c.clock.advance(2_000)
    expect(c.decisions.map(d => [d.silenceMs, d.answer])).toEqual([[500, 'UNCERTAIN'], [1_000, 'UNCERTAIN'], [2_000, 'READY']])
  })

  it('keeps the floor on a hesitation, and ends it only at the 3 s cap', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.score(0.05)
    c.clock.advance(2_700)
    expect(c.decisions.map(d => d.answer)).toEqual(['UNCERTAIN', 'KEEP_LISTENING', 'KEEP_LISTENING'])
    c.clock.advance(100)
    expect(c.decisions.at(-1)).toMatchObject({ answer: 'READY', silenceMs: 3_000, by: 'model', confidence: 0.05 })
  })

  it('starts over when the person speaks again, asking again for the next pause', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.score(0.05)
    c.clock.advance(1_000)
    c.silent(false)
    c.clock.advance(500)
    c.silent(true)
    c.clock.advance(200)
    expect(c.asks).toEqual([200, 200])
    c.score(0.95)
    c.clock.advance(300)
    expect(c.decisions.at(-1)).toMatchObject({ answer: 'READY', silenceMs: 500 })
  })

  it('ignores a score that arrives after the person spoke again', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.silent(false)
    c.score(0.95)
    c.silent(true)
    c.clock.advance(1_000)
    expect(c.decisions.filter(d => d.answer === 'READY')).toEqual([])
  })

  it('falls back to silence alone when no score comes within the timeout: READY at 3 s, never earlier', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(2_900)
    expect(c.decisions).toEqual([{ answer: 'UNCERTAIN', confidence: null, silenceMs: expect.any(Number), by: 'fallback' }])
    c.clock.advance(100)
    expect(c.decisions.at(-1)).toEqual({ answer: 'READY', confidence: null, silenceMs: 3_000, by: 'fallback' })
  })

  it('falls back at once when the model fails, and ignores a score that comes after', () => {
    const c = setup()
    c.silent(false); c.silent(true)
    c.clock.advance(200)
    c.send({ kind: 'semantics.failed', reason: 'worker stopped', t: c.clock.now() })
    c.clock.advance(50)
    expect(c.decisions[0]).toMatchObject({ answer: 'UNCERTAIN', by: 'fallback' })
    c.score(0.99)
    c.clock.advance(2_800)
    expect(c.decisions.filter(d => d.answer === 'READY')).toEqual([{ answer: 'READY', confidence: null, silenceMs: 3_000, by: 'fallback' }])
  })
})
