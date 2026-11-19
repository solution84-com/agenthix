/**
 * Where the Log's steps come from, pure: the page's own voice events read into its trail (when you began speaking,
 * your words as they grew, the sound model ending your turn, each check asked and answered, each line playing), the
 * sound model's, the heavy model's and the system's steps, and a whole turn put together from all of them.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import type { LightCallRow } from '../../../../shared/voicePlaygroundLight'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { backchannelSteps, heavySteps, noteSteps, soundSteps, typedSteps } from '../otherSteps'
import { buildLogView } from '../useLogView'

let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent
const T0 = 1_700_000_000_000

/** A trail read from events, its clock starting at T0 on the first one (at t = 0). */
function read(events: VoiceEvent[]) {
  const trail = emptyTrail()
  const reader = createTrailReader(trail, () => T0)
  events.forEach(reader)
  return trail
}

describe('the page\'s trail', () => {
  it('keeps when you began speaking, your words as they changed, and the sound model ending your turn with the verdicts before it', () => {
    const trail = read([
      ev(0, { kind: 'orchestration.floor', state: 'open' }),
      ev(100, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(900, { kind: 'orchestration.floor', state: 'person-pausing' }),
      ev(1_000, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(600, { kind: 'stt.utterance', text: 'Can you' }),
      ev(650, { kind: 'stt.utterance', text: 'Can you' }),
      ev(1_200, { kind: 'semantics.decision', answer: 'KEEP_LISTENING', confidence: 0.3, silenceMs: 300, by: 'model' }),
      ev(2_400, { kind: 'semantics.decision', answer: 'READY', confidence: 0.97, silenceMs: 500, by: 'model' }),
      ev(2_500, { kind: 'orchestration.ready', text: 'Can you', append: false }),
      ev(2_500, { kind: 'orchestration.send', text: 'Can you', append: false }),
      ev(2_500, { kind: 'orchestration.send', text: 'Can you', append: false, via: 'listen' }),
      ev(9_000, { kind: 'orchestration.ready', text: 'Hm', append: false }),
    ])
    expect(trail.speechStarts).toEqual([T0 + 100])
    expect(trail.words).toEqual([{ at: T0 + 600, text: 'Can you' }])
    expect(trail.sounds).toEqual([
      { at: T0 + 2_500, stoppedAt: T0 + 1_900, confidence: 0.97, silenceMs: 500, by: 'model', notFinished: 1 },
      { at: T0 + 9_000, stoppedAt: T0 + 9_000, confidence: null, silenceMs: null, by: 'cap', notFinished: 0 },
    ])
  })

  it('keeps each check asked and answered, and each light model line once as it began and as it stopped', () => {
    const trail = read([
      ev(0, { kind: 'listen.ask', call: 3, moment: 'soundsFinished', text: 'Hi', quietMs: 0 }),
      ev(900, { kind: 'listen.answer', call: 3, action: 'hand_over', nextCheckSecs: 2, say: 'Let me see.', lineId: 'L', turn: 'handedOver' }),
      ev(1_000, { kind: 'phrase.at', text: 'Let me see.', playing: true, lineId: 'L' }),
      ev(1_100, { kind: 'phrase.at', text: 'Let me see.', playing: true, lineId: 'L' }),
      ev(1_800, { kind: 'phrase.at', text: 'Let me see.', playing: false, lineId: 'L' }),
      ev(2_000, { kind: 'phrase.at', text: 'A stored clip', playing: true }),
    ])
    expect(trail.asks).toEqual([{ at: T0, call: 3, moment: 'soundsFinished', quietMs: 0 }])
    expect(trail.answers).toEqual([{ at: T0 + 900, call: 3, action: 'hand_over', lineId: 'L', say: 'Let me see.', turn: 'handedOver' }])
    expect(trail.plays).toEqual([{ lineId: 'L', text: 'Let me see.', start: T0 + 1_000, end: T0 + 1_800 }])
  })

  it('keeps each backchannel hum with why it came, or why none played, and shows it as a BACKCHANNEL step @SC-2227', () => {
    const trail = read([
      ev(0, { kind: 'backchannel.hum', pausedMs: 600, verdict: 'UNCERTAIN', speechMs: 11_000, hum: 'continuer', tone: 'calm', fallback: 'the hum service is off' }),
      ev(5, { kind: 'backchannel.played', text: 'Mm-hm.', hum: 'continuer', tone: 'calm', made: 'kept', pausedMs: 605 }),
      ev(5, { kind: 'phrase.at', text: 'Mm-hm.', playing: true, backchannel: true }),
      ev(20_000, { kind: 'backchannel.hum', pausedMs: 650, verdict: 'KEEP_LISTENING', speechMs: 9_200, hum: 'sympathy', tone: 'gentle', from: { call: 4, at: 19_500, ms: 420 } }),
      ev(20_005, { kind: 'backchannel.played', text: null, why: 'a line was playing' }),
      ev(30_000, { kind: 'backchannel.hum', pausedMs: 500, verdict: 'UNCERTAIN', speechMs: 2_000, hum: 'delight', tone: 'bright', from: { call: 9, at: 29_500, ms: 500 } }),
      ev(30_300, { kind: 'backchannel.played', text: 'Oh, wow!', hum: 'delight', tone: 'bright', made: 'new', pausedMs: 500 }),
      ev(40_000, { kind: 'backchannel.hum', pausedMs: 500, verdict: 'UNCERTAIN', speechMs: 2_000, hum: 'delight', tone: 'bright', from: { call: 12, at: 39_500, ms: 500 } }),
      ev(40_750, { kind: 'backchannel.unplayed', why: 'no delight sound in a bright tone made yet', speechMs: 2_000, pausedMs: 1_250 }),
    ])
    expect(trail.plays).toEqual([])
    expect(backchannelSteps(trail).map(s => [s.actor, s.tag, s.title, s.detail, s.check])).toEqual([
      ['BACKCHANNEL', 'hum', 'continuer · calm · “Mm-hm.” · already made', "stood in: the hum service is off · paused 0.6 s · not finished (UNCERTAIN) · 11 s of your speech since the agent's last sound", undefined],
      ['BACKCHANNEL', 'hum', 'sympathy · gentle · no hum played: a line was playing', "its call took 0.42 s · paused 0.7 s · not finished (KEEP_LISTENING) · 9 s of your speech since the agent's last sound", undefined],
      ['BACKCHANNEL', 'hum', 'delight · bright · “Oh, wow!” · made new', "its call took 0.50 s · paused 0.5 s · not finished (UNCERTAIN) · 2 s of your speech since the agent's last sound", undefined],
      ['BACKCHANNEL', 'hum', 'delight · bright · no hum played: no delight sound in a bright tone made yet', "its call took 0.50 s · paused 0.5 s · not finished (UNCERTAIN) · 2 s of your speech since the agent's last sound", undefined],
    ])
  })
})

describe('the backchannel\'s near misses @SC-2227', () => {
  it('keeps each pause with no hum and the rule that held it back, as a quiet BACKCHANNEL `no hum` step at the pause', () => {
    const trail = read([
      ev(0, { kind: 'backchannel.miss', why: "only 2.1 s of speech since the agent's last sound", pausedMs: 900 }),
      ev(5_000, { kind: 'backchannel.miss', why: 'you spoke again before the light model said not yet', pausedMs: null }),
      ev(9_000, { kind: 'backchannel.hum', pausedMs: 1_400, verdict: 'READY', speechMs: 5_000, notYet: true, hum: 'continuer', tone: 'calm', from: { call: 1, at: 8_600, ms: 400 } }),
      ev(9_005, { kind: 'backchannel.played', text: 'Mm.', made: 'kept', pausedMs: 1_405 }),
    ])
    expect(backchannelSteps(trail).map(s => [s.at - T0, s.tag, s.title, s.detail, s.nearMiss])).toEqual([
      [-900, 'no hum', "only 2.1 s of speech since the agent's last sound", 'paused 0.9 s', true],
      [5_000, 'no hum', 'you spoke again before the light model said not yet', undefined, true],
      [9_000, 'hum', 'continuer · calm · “Mm.” · already made', "its call took 0.40 s · paused 1.4 s · the light model kept your turn open · 5 s of your speech since the agent's last sound", undefined],
    ])
  })
})

describe('the other actors\' steps', () => {
  it('says how sure SOUND was, after how long a quiet, and how many not-finished verdicts came before', () => {
    const trail = emptyTrail()
    trail.sounds.push({ at: 1, stoppedAt: -499, confidence: 0.97, silenceMs: 500, by: 'model', notFinished: 2 }, { at: 2, stoppedAt: 2, confidence: null, silenceMs: null, by: 'cap', notFinished: 0 })
    expect(soundSteps(trail).map(s => [s.actor, s.tag, s.title, s.detail, s.stoppedAt])).toEqual([
      ['SOUND', 'finished', '97% sure, after 0.5 s of quiet', '2 not-finished before this', -499],
      ['SOUND', 'finished', 'no verdict: your words stood still to the pause limit', undefined, 2],
    ])
  })

  const entry = (e: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id: 'e', role: 'agent', text: '', at: 1_000, ...e }) as PlaygroundEntry

  it('makes each reply a HEAVY step with its tokens, leaving out a turn the light model closed and the lines heard before it', () => {
    const trail = emptyTrail()
    trail.plays.push({ lineId: 'L', text: 'Let me check.', start: 0, end: 900 })
    trail.answers.push({ at: 0, call: 1, action: 'close_turn', turn: 'closed', turnId: 'closed' })
    const entries = [
      entry({ id: 'a1', turnId: 't1', text: 'Let me check. Tomorrow in Melbourne is sunny.', firstTextAt: 2_000, state: 'COMPLETED' }),
      entry({ id: 'a2', turnId: 'closed', text: 'You are welcome.', firstTextAt: 3_000, state: 'COMPLETED' }),
      entry({ id: 'a3', turnId: 't3', withdrawn: true, state: 'CANCELLED', at: 4_000 }),
      entry({ id: 'a4', turnId: 't4', state: 'FAILED', error: 'No model', at: 5_000 }),
      entry({ id: 'p1', role: 'person', text: 'Typed it', at: 6_000 }),
      entry({ id: 'p2', role: 'person', text: 'Said it', at: 6_500, spoken: true }),
    ]
    const steps = heavySteps(entries, [], [{ turnId: 't1', model: 'p1/flash', inputTokens: 630, outputTokens: 18 }], [{ id: 'r', text: 'Sam asked about Melbourne.', ms: 700, at: 9_000 }], trail, () => 'DeepSeek Flash')
    expect(steps.map(s => [s.tag, s.at, s.title, s.detail ?? null, s.answers ?? false])).toEqual([
      ['reply', 2_000, '“Tomorrow in Melbourne is sunny.”', 'DeepSeek Flash · 630 tokens in, 18 out', true],
      ['reply', 4_000, 'not heard: you went on, so it was replaced', null, false],
      ['reply', 5_000, 'failed: No model', null, true],
      ['recap', 9_000, '“Sam asked about Melbourne.”', '4 words · 0.7 s', false],
    ])
    expect(steps[2]!.error).toBe(true)
    expect(typedSteps(entries).map(s => [s.actor, s.title, s.typed])).toEqual([['YOU', '“Typed it”', true]])
    expect(noteSteps([{ id: 'n', at: 1, kind: 'error', title: 'It broke' }])[0]).toMatchObject({ actor: 'SYSTEM', tag: 'error', error: true })
  })
})

describe('a whole turn', () => {
  it('is put together from the page\'s events, the server\'s rows and the conversation', () => {
    const trail = read([
      ev(0, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(500, { kind: 'stt.utterance', text: 'Can you look up the weather?' }),
      ev(2_400, { kind: 'semantics.decision', answer: 'READY', confidence: 0.95, silenceMs: 500, by: 'model' }),
      ev(2_400, { kind: 'orchestration.ready', text: 'Can you look up the weather?', append: false }),
      ev(2_401, { kind: 'stt.utterance', text: '' }),
      ev(2_450, { kind: 'listen.ask', call: 1, moment: 'soundsFinished', text: 'Can you look up the weather?', quietMs: 0 }),
      ev(3_500, { kind: 'listen.answer', call: 1, action: 'hand_over', nextCheckSecs: 2, say: 'Let me check.', lineId: 'L', turn: 'handedOver' }),
      ev(3_700, { kind: 'phrase.at', text: 'Let me check.', playing: true, lineId: 'L' }),
      ev(4_500, { kind: 'phrase.at', text: 'Let me check.', playing: false, lineId: 'L' }),
    ])
    const call: LightCallRow = {
      id: 'c1', seq: 1, moment: 'soundsFinished', keptOpen: false, quietMs: 0, workingMs: null, message: 'Can you look up the weather?',
      choice: 'hand_over', words: 'Let me check.', answer: null, why: null, withReason: false, asked: 'the weather', nextCheck: 2, dropped: null, ms: 1_000,
      stale: false, overLimit: false, superseded: false, failed: false, inputTokens: 1, outputTokens: 1, at: T0 + 3_480,
    }
    const view = buildLogView({
      entries: [
        { id: 'p', role: 'person', text: 'Can you look up the weather?', at: T0 + 3_490, spoken: true, turnId: 't' },
        { id: 'a', role: 'agent', text: 'Let me check. It is sunny.', at: T0 + 3_495, firstTextAt: T0 + 6_000, turnId: 't', state: 'COMPLETED', spoken: true },
      ],
      decisions: [], calls: [], notes: [],
    }, {
      calls: [call], turns: [{ id: 'tr', seq: 1, outcome: 'handedOver', say: 'Let me check.', at: T0 + 3_480 }], recaps: [],
      lines: [{ id: 'l', lineId: 'L', text: 'Let me check.', stored: false, at: T0 + 4_510 }],
    }, trail, m => m)
    const [card] = view.cards
    expect(card!.steps.map(s => [(s.rel / 1000).toFixed(1), s.actor, s.tag, s.detail ?? ''])).toEqual([
      ['0.0', 'YOU', 'said', ''],
      ['2.4', 'SOUND', 'finished', ''],
      ['2.5', 'LIGHT', 'hand_over', 'heard “Can you look up the weather?” · understood as “the weather” · hq checks again in 2 s · 1.00 s'],
      ['3.7', 'LIGHT', 'line', 'from the hand_over at 2.5 s · tone: calm · played to its end · 0.8 s'],
      ['6.0', 'HEAVY', 'reply', 'first words 3.5 s after the hand-over'],
    ])
    expect(card!.steps[4]!.title).toBe('“It is sunny.”')
    expect(card!.outcome).toBe('Handed to the heavy model')
    expect(card!.timings).toEqual(['you stopped at 1.9 s', 'first sound 1.8 s after you stopped', 'answer 4.1 s after you stopped'])
    expect(card!.steps.filter(s => s.ruleBroken)).toEqual([])
  })
})
