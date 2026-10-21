import { describe, expect, it } from 'vitest'
import type { VoiceEvent, VoiceEventBody } from '../../events'
import { initialLab, isBuilt, reduceAll, reduceLab, TRACE_POINTS } from '../rows'

let seq = 0
const ev = (body: VoiceEventBody, t = 0): VoiceEvent => ({ ...body, t, seq: seq++ }) as VoiceEvent

describe('the lab rows', () => {
  it('starts with every row no events yet', () => {
    const s = initialLab()
    for (const row of ['silence', 'acoustic', 'stt', 'semantics', 'floor'] as const) expect(isBuilt(s, row)).toBe(false)
  })

  it('draws the confidence trace, bounded, and the silence flag', () => {
    let s = initialLab()
    for (let i = 0; i < TRACE_POINTS + 10; i++) s = reduceLab(s, ev({ kind: 'acoustic.vadScore', confidence: i / 1000 }, i))
    s = reduceLab(s, ev({ kind: 'acoustic.silence', silent: true }, 999))
    expect(s.silence.trace).toHaveLength(TRACE_POINTS)
    expect(s.silence.trace[0]!.t).toBe(10)
    expect(s.silence.silent).toBe(true)
    expect(isBuilt(s, 'silence')).toBe(true)
    expect(isBuilt(s, 'stt')).toBe(false)
  })

  it('takes the detector thresholds from the detector event', () => {
    const detector = { onThreshold: 0.6, offThreshold: 0.4, minVoiceMs: 200, minSilenceMs: 100 }
    const s = reduceLab(initialLab(), ev({ kind: 'acoustic.detector', detector, reason: 'test' }))
    expect(s.silence.detector).toEqual(detector)
  })

  it('tells provisional words from committed, and keeps the lag', () => {
    const words = (text: string, committed: boolean) => ev({ kind: 'stt.words', text, words: [], committed, order: null }, 5)
    let s = reduceAll([words('hel', false), words('hello wor', false)])
    expect(s.stt.provisional).toBe('hello wor')
    expect(s.stt.committed).toEqual([])
    s = [words('hello world', true), ev({ kind: 'stt.lag', lagMs: 320, queuedMs: 64 })].reduce(reduceLab, s)
    expect(s.stt.provisional).toBe('')
    expect(s.stt.committed.map(w => w.text)).toEqual(['hello world'])
    expect(s.stt).toMatchObject({ lagMs: 320, queuedMs: 64 })
  })

  it('keeps each score with its silence and each decision', () => {
    const s = reduceAll([
      ev({ kind: 'semantics.score', score: 0.7, silenceMs: 500 }, 1),
      ev({ kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' }, 2),
    ])
    expect(s.semantics.scores).toEqual([{ t: 1, score: 0.7, silenceMs: 500 }])
    expect(s.semantics.decisions[0]).toMatchObject({ answer: 'READY', by: 'model' })
  })

  it('follows the floor and lists every duck, stop and resume', () => {
    const s = reduceAll([
      ev({ kind: 'orchestration.floor', state: 'agent-speaking' }, 1),
      ev({ kind: 'orchestration.playback', action: 'duck', replyId: 'r' }, 2),
      ev({ kind: 'orchestration.playback', action: 'resume', replyId: 'r' }, 3),
      ev({ kind: 'orchestration.playback', action: 'stop', replyId: 'r' }, 4),
    ])
    expect(s.floor.state).toBe('agent-speaking')
    expect(s.floor.playback.map(p => p.action)).toEqual(['duck', 'resume', 'stop'])
  })

  it('does not change for events it does not draw', () => {
    const s = initialLab()
    expect(reduceLab(s, ev({ kind: 'clock.tick' }))).toBe(s)
    expect(reduceLab(s, ev({ kind: 'audio.frame', pcm: new Int16Array(4) }))).toBe(s)
  })
})
