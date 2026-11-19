/**
 * The Log's order and grouping around two things the page's clock makes close: SOUND saying you finished and the check
 * it caused, asked in the same moment; and you stopping a reply by speaking over it, whose words reach the page only
 * after the stop, while the sound model may already have judged them.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import type { LightCallRow } from '../../../../shared/voicePlaygroundLight'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import { logTurns } from '../logTurns'
import type { LogStep } from '../logModel'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { buildLogView } from '../useLogView'

const T0 = 1_700_000_000_000
const at = (s: number) => T0 + Math.round(s * 1000)
let seq = 0
const ev = (s: number, body: Record<string, unknown>) => ({ t: Math.round(s * 1000), seq: seq++, ...body }) as unknown as VoiceEvent

function read(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const reader = createTrailReader(trail, () => T0)
  events.forEach(reader)
  return trail
}

const callRow = (p: Partial<LightCallRow> & Pick<LightCallRow, 'id' | 'seq' | 'moment' | 'at'>): LightCallRow => ({
  keptOpen: false, quietMs: 0, workingMs: null, message: '', choice: 'keep_listening', words: null, answer: null, why: null,
  withReason: false, asked: null, nextCheck: 2, dropped: null, ms: 900, stale: false, overLimit: false, superseded: false,
  failed: false, inputTokens: 1, outputTokens: 1, ...p,
})

const rows = (c: { steps: { actor: string; tag: string; rel: number; ruleBroken?: number }[] }) =>
  c.steps.map(s => [(s.rel / 1000).toFixed(1), s.actor, s.tag, s.ruleBroken ?? null])

describe('SOUND and the check it caused, at the same moment', () => {
  it('SOUND comes first, and the hand-over breaks no rule', () => {
    const step = (s: number, p: Omit<LogStep, 'at' | 'title'>): LogStep => ({ at: at(s), title: p.tag, ...p })
    // The light model's steps come first in the list, as the page builds it.
    const view = logTurns({
      speechStarts: [at(0)], messages: [], words: [{ at: at(0.4), text: 'Can you repeat that?' }],
      steps: [
        step(3.4, { id: 'h', actor: 'LIGHT', tag: 'hand_over', check: true, attrs: { moment: 'soundsFinished' }, ends: 'handedOver' }),
        step(3.4, { id: 's', actor: 'SOUND', tag: 'finished', stoppedAt: at(2.9) }),
      ],
    })
    expect(rows(view.cards[0]!)).toEqual([['0.0', 'YOU', 'said', null], ['3.4', 'SOUND', 'finished', null], ['3.4', 'LIGHT', 'hand_over', null]])
  })

  it('a hand-over really before SOUND still breaks rule 3', () => {
    const step = (s: number, p: Omit<LogStep, 'at' | 'title'>): LogStep => ({ at: at(s), title: p.tag, ...p })
    const view = logTurns({
      speechStarts: [at(0)], messages: [], words: [{ at: at(0.4), text: 'Can you repeat that?' }],
      steps: [
        step(3.4, { id: 'h', actor: 'LIGHT', tag: 'hand_over', check: true, attrs: { moment: 'soundsFinished' }, ends: 'handedOver' }),
        step(3.5, { id: 's', actor: 'SOUND', tag: 'finished', stoppedAt: at(2.9) }),
      ],
    })
    expect(rows(view.cards[0]!)[1]).toEqual(['3.4', 'LIGHT', 'hand_over', 3])
  })
})

describe('you stop a reply by speaking over it, and go on to ask again', () => {
  // The owner's first two turns: "Can you repeat that?" handed over and answered; then "Wait, can you repeat that?"
  // said over the reply. The reply ducks, resumes, the sound model judges the words finished, and only then do the words
  // arrive and stop the reply; the turn goes on once the speech service has caught up.
  const trail = read([
    ev(0, { kind: 'orchestration.floor', state: 'person-speaking' }),
    ev(0.3, { kind: 'stt.utterance', text: 'Can you repeat that?' }),
    ev(1.4, { kind: 'orchestration.floor', state: 'person-pausing' }),
    ev(3.4, { kind: 'semantics.decision', answer: 'READY', confidence: 0.77, silenceMs: 2_000, by: 'model' }),
    ev(3.4, { kind: 'orchestration.ready', text: 'Can you repeat that?', append: false }),
    ev(3.4, { kind: 'listen.ask', call: 2, moment: 'soundsFinished', text: 'Can you repeat that?', quietMs: 2_000 }),
    ev(3.4, { kind: 'stt.utterance', text: '' }),
    ev(4.4, { kind: 'listen.answer', call: 2, action: 'hand_over', nextCheckSecs: 2, say: 'Of course.', lineId: 'L1', turn: 'handedOver' }),
    ev(5.2, { kind: 'phrase.at', text: 'Of course.', playing: true, lineId: 'L1' }),
    ev(7.0, { kind: 'phrase.at', text: 'Of course.', playing: false, lineId: 'L1' }),
    ev(7.8, { kind: 'orchestration.floor', state: 'agent-speaking' }),
    // Over the reply: it ducks at the voice, and resumes before the words come.
    ev(17.1, { kind: 'orchestration.floor', state: 'ducked' }),
    ev(17.1, { kind: 'orchestration.playback', action: 'duck', replyId: 't1' }),
    ev(18.7, { kind: 'orchestration.floor', state: 'agent-speaking' }),
    ev(18.9, { kind: 'semantics.decision', answer: 'READY', confidence: 0.99, silenceMs: 500, by: 'model' }),
    ev(19.5, { kind: 'orchestration.playback', action: 'stop', replyId: 't1', by: 'stop-word' }),
    ev(19.5, { kind: 'orchestration.floor', state: 'person-pausing' }),
    ev(19.6, { kind: 'stt.utterance', text: 'Wait, can you repeat that?' }),
    ev(20.6, { kind: 'listen.ask', call: 3, moment: 'quietAfterWords', text: 'Wait, can you repeat that?', quietMs: 600 }),
    ev(22.5, { kind: 'orchestration.ready', text: 'Wait, can you repeat that?', append: false }),
    ev(22.5, { kind: 'listen.ask', call: 4, moment: 'soundsFinished', text: 'Wait, can you repeat that?', quietMs: 0 }),
    ev(22.5, { kind: 'stt.utterance', text: '' }),
  ])
  const entries: PlaygroundEntry[] = [
    { id: 'p1', role: 'person', text: 'Can you repeat that?', at: at(4.4), spoken: true, turnId: 't1' },
    { id: 'a1', role: 'agent', text: 'Of course.\n\nHere it is again.', at: at(4.5), firstTextAt: at(4.8), turnId: 't1', state: 'COMPLETED', spoken: true, interrupted: true },
    { id: 'p2', role: 'person', text: 'Wait, can you repeat that?', at: at(23.5), spoken: true, turnId: 't2' },
  ]
  const view = buildLogView({ entries, decisions: [], calls: [], notes: [] }, {
    calls: [
      // The server's rows are written when each call is answered.
      callRow({ id: 'c2', seq: 2, moment: 'soundsFinished', choice: 'hand_over', words: 'Of course.', at: at(4.4), ms: 1_000 }),
      callRow({ id: 'c3', seq: 3, moment: 'quietAfterWords', at: at(21.4), ms: 800 }),
      callRow({ id: 'c4', seq: 4, moment: 'soundsFinished', choice: 'hand_over', words: 'Right.', at: at(23.5), ms: 1_000 }),
    ],
    turns: [
      { id: 'tr2', seq: 2, outcome: 'handedOver', say: 'Of course.', at: at(4.4) },
      { id: 'tr4', seq: 4, outcome: 'handedOver', say: 'Right.', at: at(23.5) },
    ],
    recaps: [{ id: 'r', text: 'Sam asked for a repeat.', ms: 1_000, at: at(6.2) }],
    lines: [{ id: 'l', lineId: 'L1', text: 'Of course.', stored: false, at: at(7.0) }],
  }, trail, m => m)
  const [second, first] = view.cards

  it('the first card ends with the reply and its recap: no SOUND of your next words in it', () => {
    expect(view.cards).toHaveLength(2)
    expect(rows(first!)).toEqual([
      ['0.0', 'YOU', 'said', null],
      ['3.4', 'SOUND', 'finished', null],
      ['3.4', 'LIGHT', 'hand_over', null],
      ['4.8', 'HEAVY', 'reply', null],
      ['5.2', 'LIGHT', 'line', null],
      ['6.2', 'HEAVY', 'recap', null],
    ])
  })

  it('the next card starts when you spoke over the reply, with your words tagged as stopping it, and its SOUND after them', () => {
    expect(second!.zero).toBe(at(17.1))
    expect(rows(second!)).toEqual([
      ['0.0', 'YOU', 'stopped the reply', null],
      ['3.5', 'LIGHT', 'keep_listening', null],
      ['5.4', 'SOUND', 'finished', null],
      ['5.4', 'LIGHT', 'hand_over', null],
    ])
    expect(second!.steps[0]!.title).toBe('“Wait, can you repeat that?”')
    expect(second!.message).toBe('Wait, can you repeat that?')
    // You stopped speaking where the sound model heard you stop: 0.5 s before its verdict at 1.8 s.
    expect(second!.timings[0]).toBe('you stopped at 1.3 s')
  })

  it('a stop word alone is no turn ending: no SOUND, and your next words join its card', () => {
    const alone = read([
      ev(0, { kind: 'orchestration.floor', state: 'open' }),
      ev(10, { kind: 'orchestration.floor', state: 'agent-speaking' }),
      ev(11, { kind: 'orchestration.floor', state: 'ducked' }),
      ev(11.6, { kind: 'semantics.decision', answer: 'READY', confidence: 0.99, silenceMs: 400, by: 'model' }),
      ev(12, { kind: 'orchestration.playback', action: 'stop', replyId: 't1', by: 'stop-word' }),
      ev(12, { kind: 'orchestration.floor', state: 'open' }),
      ev(12.1, { kind: 'stt.utterance', text: 'Stop.' }),
      ev(12.2, { kind: 'stt.utterance', text: '' }),
      ev(15, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(15.4, { kind: 'stt.utterance', text: 'What about Friday?' }),
      ev(16, { kind: 'orchestration.floor', state: 'person-pausing' }),
      ev(16.5, { kind: 'semantics.decision', answer: 'KEEP_LISTENING', confidence: 0.4, silenceMs: 500, by: 'model' }),
      ev(17.2, { kind: 'orchestration.ready', text: 'What about Friday?', append: false }),
    ])
    // The stop word's verdict is not the one that ended the next words: they ended on the pause cap.
    expect(alone.sounds).toEqual([{ at: T0 + 17_200, stoppedAt: T0 + 17_200, confidence: null, silenceMs: null, by: 'cap', notFinished: 1 }])
    expect(alone.stops).toEqual([T0 + 12_000])
    const v = buildLogView({ entries: [], decisions: [], calls: [], notes: [] }, { calls: [], turns: [], recaps: [], lines: [] }, alone, m => m)
    expect(v.cards).toHaveLength(1)
    expect(rows(v.cards[0]!).map(r => r.slice(1, 3))).toEqual([['YOU', 'stopped the reply'], ['YOU', 'said'], ['SOUND', 'finished']])
    expect(v.cards[0]!.steps.some(s => s.ends)).toBe(false)
  })
})

describe('your words reach the page seconds after you said them', () => {
  // The owner's trailing-off turn: speech from 2.6 s to 7.0 s, the sound model's verdict at its 3 s pause limit at
  // 10.0 s, the words only from 10.9 s. The checks' pauses are quiet since the sound stopped, on the same clock.
  const read3 = (events: VoiceEvent[]) => {
    const trail = emptyTrail()
    const reader = createTrailReader(trail, () => T0, 3_000)
    events.forEach(reader)
    return trail
  }
  const SAID = 'I was thinking we could maybe move the meeting to'
  const INVITE = '…move the meeting to?'
  const trail = read3([
    ev(0, { kind: 'orchestration.floor', state: 'open' }),
    ev(2.6, { kind: 'orchestration.floor', state: 'person-speaking' }),
    ev(7.0, { kind: 'orchestration.floor', state: 'person-pausing' }),
    ev(7.5, { kind: 'semantics.decision', answer: 'UNCERTAIN', confidence: 0.01, silenceMs: 500, by: 'model' }),
    ev(8.0, { kind: 'semantics.decision', answer: 'KEEP_LISTENING', confidence: 0.01, silenceMs: 1_000, by: 'model' }),
    ev(9.0, { kind: 'semantics.decision', answer: 'KEEP_LISTENING', confidence: 0.01, silenceMs: 2_000, by: 'model' }),
    ev(10.0, { kind: 'semantics.decision', answer: 'READY', confidence: 0.01, silenceMs: 3_000, by: 'model' }),
    ev(10.9, { kind: 'stt.utterance', text: 'I was thinking' }),
    ev(11.2, { kind: 'listen.ask', call: 2, moment: 'quietAfterWords', text: 'I was thinking', quietMs: 4_260 }),
    ev(13.8, { kind: 'stt.utterance', text: SAID }),
    ev(14.1, { kind: 'listen.ask', call: 3, moment: 'quietAfterWords', text: SAID, quietMs: 7_160 }),
    ev(14.2, { kind: 'orchestration.ready', text: SAID, append: false }),
    ev(14.2, { kind: 'listen.ask', call: 4, moment: 'soundsFinished', text: SAID, quietMs: 7_200 }),
    ev(14.2, { kind: 'orchestration.send', text: SAID, append: false, via: 'listen' }),
    ev(15.4, { kind: 'listen.answer', call: 4, action: 'invite', nextCheckSecs: 12, say: INVITE, lineId: 'L1' }),
    ev(18.1, { kind: 'phrase.at', text: INVITE, playing: true, lineId: 'L1' }),
    ev(19.3, { kind: 'phrase.at', text: INVITE, playing: false, lineId: 'L1' }),
    ev(27.4, { kind: 'listen.ask', call: 5, moment: 'quiet', text: '', quietMs: 20_500, keptOpen: true }),
  ])
  const view = buildLogView({ entries: [], decisions: [], calls: [], notes: [] }, {
    calls: [
      callRow({ id: 'c2', seq: 2, moment: 'quietAfterWords', quietMs: 4_260, message: 'I was thinking', at: at(13.1), ms: 1_890 }),
      callRow({ id: 'c3', seq: 3, moment: 'quietAfterWords', quietMs: 7_160, message: SAID, choice: null, superseded: true, at: at(14.2), ms: 120 }),
      callRow({ id: 'c4', seq: 4, moment: 'soundsFinished', quietMs: 7_200, message: SAID, choice: 'invite', words: INVITE, at: at(15.4), ms: 1_130 }),
      callRow({ id: 'c5', seq: 5, moment: 'quiet', keptOpen: true, quietMs: 20_500, message: SAID, at: at(28.5), ms: 1_140 }),
    ],
    turns: [{ id: 'tr4', seq: 4, outcome: 'notYet', say: null, at: at(15.4) }],
    recaps: [],
    lines: [{ id: 'l', lineId: 'L1', text: INVITE, stored: false, at: at(19.3) }],
  }, trail, m => m)
  const card = view.cards[0]!

  it('the card starts when you started speaking, and you stopped where the sound model heard you stop', () => {
    expect(view.cards).toHaveLength(1)
    expect(card.zero).toBe(at(2.6))
    expect(card.steps[0]).toMatchObject({ actor: 'YOU', rel: 0 })
    expect(card.timings[0]).toBe('you stopped at 4.4 s')
  })

  it('every check\'s pause fits the card: asked at its time, it was that long after you stopped', () => {
    const checks = card.steps.filter(s => s.check)
    expect(checks.map(s => (s.rel / 1000).toFixed(1))).toEqual(['8.6', '11.5', '11.6', '24.8'])
    const stopped = 4_400
    const quiet = [4_260, 7_160, 7_200, 20_500]
    checks.forEach((s, i) => expect(Math.abs(s.rel - quiet[i]! - stopped)).toBeLessThan(150))
    expect(card.steps.every(s => s.rel >= 0)).toBe(true)
  })

  it('SOUND says it was not sure, and its pause limit ended the turn', () => {
    expect(card.steps.find(s => s.actor === 'SOUND')!.title).toBe('not sure (1%): its 3 s pause limit ended it')
  })
})
