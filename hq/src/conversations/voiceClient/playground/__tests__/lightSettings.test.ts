/**
 * The light model's settings in the playground (plan task 5.2): read and held within their limits, kept between
 * visits, reset, and one timing object the voice session runs on, changed in place; and the Log's steps for each
 * check, the turn's ending and each line.
 */
import { BACKCHANNEL_SETTINGS } from '../../backchannel/settings'
import { describe, expect, it } from 'vitest'
import { LISTENER_SETTINGS } from '../../../voice/listener/settings'
import { LISTENER_TIMING } from '../../listener/settings'
import { HQ_LISTENER_CHOICE, type LightCallRow } from '../../../../shared/voicePlaygroundLight'
import type { ModelChoices } from '../../../../shared/conversations/protocol'
import { BACKCHANNEL_VALUES, DEFAULT_SETTINGS, createPlaygroundSettings, readSettings } from '../settings'
import { listenerWith, timingOf, valueAt, OWN_TIMING } from '../lightTuning'
import { effectiveListenerModel } from '../lightModel'
import { lightSteps } from '../lightSteps'
import { emptyTrail } from '../pageTrail'
import { resetListener } from '../ListenerTuning'
import { readBargeIn } from '../bargeInNumbers'
import { VOICE_SETTINGS } from '../../settings'

function memory() {
  const kept = new Map<string, string>()
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v) } }
}

describe('the light model settings @SC-1840 @SC-2224 @SC-2225 @SC-2230', () => {
  it('open with the light model on, its first values hq runs, and the browser timing as the voice client has it', () => {
    const v = readSettings(null)
    expect(v).toMatchObject({ adaptiveVoice: true, listenerModel: null })
    expect(v).not.toHaveProperty('lightModel')
    expect(v.listener).toEqual(LISTENER_SETTINGS)
    expect(timingOf(v.listener, v.ownTiming)).toEqual(LISTENER_TIMING)
  })

  it('hold every kept number within its limits, and anything of another shape falls back', () => {
    const v = readSettings(JSON.stringify({
      lightModel: false, listenerModel: 'p1/x', listener: { caps: { acknowledge: 99, hold: 'many' }, callTimeoutMs: 1 }, ownTiming: { quietGainDb: 5, noAnswerMs: 1, finishWaitMs: 0, falseFinishMs: 'soon' },
    }))
    // Adaptive voice is the light model: an older kept switch of its own is read as Adaptive voice alone.
    expect(v).toMatchObject({ adaptiveVoice: true })
    expect(v).not.toHaveProperty('lightModel')
    expect(v.listener.caps).toMatchObject({ acknowledge: 12, hold: 12 })
    expect(v.listener.callTimeoutMs).toBe(500)
    expect(v.ownTiming).toEqual({ ...OWN_TIMING, quietGainDb: 0, noAnswerMs: 3_000, finishWaitMs: 500 })
    expect(readSettings(JSON.stringify({ listener: 'nope', ownTiming: [1] }))).toMatchObject({ listener: LISTENER_SETTINGS, ownTiming: OWN_TIMING })
  })

  it('keep a change for the next visit, change the session\'s timing object in place, and reset @SC-2227', () => {
    const storage = memory()
    const s = createPlaygroundSettings(storage)
    const timing = s.listenerTiming()
    const backchannel = s.backchannel()
    s.patch({
      listener: listenerWith(s.get().listener, 'schedule.quietFirst', 4), ownTiming: { ...s.get().ownTiming, quietGainDb: -9 },
      backchannel: { ...s.get().backchannel, speechMs: 12_000 },
    })
    expect(s.listenerTiming()).toBe(timing)
    expect(timing).toMatchObject({ quietGainDb: -9 })
    expect(s.backchannel()).toBe(backchannel)
    expect(backchannel.speechMs).toBe(12_000)
    const again = createPlaygroundSettings(storage)
    expect(valueAt('schedule.quietFirst', again.get().listener, again.get().ownTiming)).toBe(4)
    expect(again.get().backchannel.speechMs).toBe(12_000)
    expect(valueAt('own.quietGainDb', again.get().listener, again.get().ownTiming)).toBe(-9)
    resetListener(again)
    expect(again.get().listener).toEqual(DEFAULT_SETTINGS.listener)
    expect(again.listenerTiming()).toEqual(LISTENER_TIMING)
    expect(again.backchannel()).toEqual(BACKCHANNEL_SETTINGS)
  })

  it('tune when a reply talked over waits for the words: held within limits, kept, changed in place, and reset @SC-2239', () => {
    const storage = memory()
    const s = createPlaygroundSettings(storage)
    const bargeIn = s.bargeIn()
    expect(bargeIn).toEqual(VOICE_SETTINGS.bargeIn)
    s.patch({ bargeIn: readBargeIn({ wordsVoiceMs: 800, wordsWaitMs: 99_000 }) })
    expect(s.bargeIn()).toBe(bargeIn)
    expect(bargeIn).toMatchObject({ wordsVoiceMs: 800, wordsWaitMs: 3_000, confirmWindowMs: VOICE_SETTINGS.bargeIn.confirmWindowMs })
    expect(createPlaygroundSettings(storage).get().bargeIn).toEqual({ wordsVoiceMs: 800, wordsWaitMs: 3_000 })
    resetListener(s)
    expect(s.bargeIn()).toEqual(VOICE_SETTINGS.bargeIn)
  })

  it('take the backchannel\'s new first values over the old ones kept untouched, and keep any chosen @SC-2227', () => {
    const old = { on: true, pauseMs: 600, latestPauseMs: 800, speechMs: 9_000, gainDb: -9 }
    expect(readSettings(JSON.stringify({ backchannel: old })).backchannel).toEqual({ ...BACKCHANNEL_SETTINGS, gainDb: -9 })
    // A page kept from before the hum service takes its first values too.
    const { reactionSpeechMs, reactionHoldMs, reactionGapSpeechMs } = BACKCHANNEL_SETTINGS
    const now = { backchannelValues: BACKCHANNEL_VALUES }
    const chosen = { ...old, speechMs: 7_000, reactionSpeechMs: 2_000, reactionGapSpeechMs, reactionHoldMs, serviceOn: true, serviceIntervalMs: 1_000 }
    expect(readSettings(JSON.stringify({ ...now, backchannel: { ...old, speechMs: 7_000, reactionSpeechMs: 2_000 } })).backchannel).toEqual(chosen)
    expect(readSettings(JSON.stringify({ ...now, backchannel: chosen })).backchannel).toEqual(chosen)
  })

  it('reset the hum spacing and the sounds\' steering once, to the values of 19 Nov, then keep what is chosen @SC-2228', () => {
    const before = { backchannel: { ...BACKCHANNEL_SETTINGS, speechMs: 2_500, reactionSpeechMs: 1_000, gainDb: -9 }, humSteering: { calm: '[calm, attentive]' } }
    const read = readSettings(JSON.stringify(before))
    expect(read.backchannel).toEqual({ ...BACKCHANNEL_SETTINGS, gainDb: -9 })
    expect(BACKCHANNEL_SETTINGS).toMatchObject({ speechMs: 6_000, reactionSpeechMs: 3_000, reactionGapSpeechMs: 8_000 })
    expect(read.humSteering).toEqual({})
    expect(read.backchannelValues).toBe(BACKCHANNEL_VALUES)
    // Kept with the mark: a value chosen after the reset stays.
    const after = { ...read, backchannel: { ...read.backchannel, speechMs: 4_000 }, humSteering: { warm: '[kind]' } }
    expect(readSettings(JSON.stringify(after))).toMatchObject({ backchannel: { speechMs: 4_000 }, humSteering: { warm: '[kind]' } })
  })

  it('offer hq\'s schedule in seconds, and widen the browser\'s range to its longest wait', () => {
    const l = listenerWith(LISTENER_SETTINGS, 'schedule.quietThird', 10)
    expect(l.schedule).toMatchObject({ quietFirst: 5, quietSecond: 10, quietThird: 15 })
    expect(valueAt('schedule.quietThird', l, OWN_TIMING)).toBe(15)
    expect(timingOf(l, OWN_TIMING).nextCheck).toEqual({ ...LISTENER_TIMING.nextCheck, maxSecs: 45 })
    expect(timingOf(listenerWith(LISTENER_SETTINGS, 'schedule.workingEvery', 50), OWN_TIMING).nextCheck.maxSecs).toBe(50)
  })

  it('run DeepSeek Flash when nothing is chosen and it is offered, else hq\'s own choice', () => {
    const choices = (values: string[]) => ({ models: values.map(value => ({ value, label: value })), recent: [], current: '' }) as unknown as ModelChoices
    expect(effectiveListenerModel(null, choices(['p1/a', 'or/~deepseek/deepseek-flash-latest']))).toBe('or/~deepseek/deepseek-flash-latest')
    expect(effectiveListenerModel(null, choices(['p1/a']))).toBeNull()
    expect(effectiveListenerModel(HQ_LISTENER_CHOICE, choices(['or/~deepseek/deepseek-flash-latest']))).toBeNull()
    expect(effectiveListenerModel('p1/a', undefined)).toBe('p1/a')
    expect(effectiveListenerModel('p1/a', choices(['p1/a']))).toBe('p1/a')
    // A choice the picker no longer offers is not run: the baseline, else hq's own choice.
    expect(effectiveListenerModel('p9/gone', choices(['p1/a', 'or/~deepseek/deepseek-flash-latest']))).toBe('or/~deepseek/deepseek-flash-latest')
    expect(effectiveListenerModel('p9/gone', choices(['p1/a']))).toBeNull()
  })
})

const call = (p: Partial<LightCallRow>): LightCallRow => ({
  id: 'c1', seq: 4, moment: 'soundsFinished', keptOpen: false, quietMs: 600, workingMs: null, message: "What's the weather in Melbourne?",
  choice: 'hand_over', words: 'Let me check.', answer: 'Sunny.', why: null, withReason: false, asked: 'the weather', nextCheck: 3, dropped: null, ms: 912,
  stale: false, overLimit: false, superseded: false, failed: false, inputTokens: 1, outputTokens: 1, at: 1_000, ...p,
})

describe('the light model in the Log @SC-1840 @SC-2224 @SC-2225 @SC-2230', () => {
  const trail = emptyTrail()
  it('shows each check as why it was asked and what it chose, with what it understood, its held-back answer and its time, readable from the page', () => {
    const [row] = lightSteps([call({})], [], [], trail)
    expect(row).toMatchObject({
      actor: 'LIGHT', tag: 'hand_over', check: true, at: 1_000 - 912,
      title: 'Asked because SOUND said finished → hand over with a hold “Let me check.” · calm',
      detail: 'heard “What\'s the weather in Melbourne?” · understood as “the weather” · would have answered “Sunny.” (not said) · hq checks again in 3 s · 0.91 s',
      attrs: { seq: '4', moment: 'soundsFinished', choice: 'hand_over', ms: '912', answer: 'Sunny.' },
    })
    // Each line's tone, as the light model gave it (spec §Tone).
    expect(lightSteps([call({ tone: 'gentle' })], [], [], trail)[0]!.title).toBe('Asked because SOUND said finished → hand over with a hold “Let me check.” · gentle')
    const late = lightSteps([call({ moment: 'quiet', keptOpen: true, quietMs: 4000, choice: null, words: null, answer: null, asked: null, nextCheck: null, overLimit: true, message: 'x'.repeat(80) })], [], [], trail)[0]!
    expect(late).toMatchObject({ tag: 'no answer', afterNotYet: true, title: 'Asked because still quiet 4.0 s after a “not yet”' })
    expect(late.detail).toBe(`still waiting at its time limit · heard “…${'x'.repeat(60)}” · 0.91 s`)
    expect(late.attrs).toMatchObject({ choice: 'none', 'over-limit': 'true' })
    expect(lightSteps([call({ moment: 'quietAfterWords', quietMs: 430, choice: null, superseded: true })], [], [], trail)[0]!.title).toBe('Asked because you paused 0.43 s (an older page\'s check)')
    expect(lightSteps([call({ moment: 'working', workingMs: 2_000, choice: 'keep_listening' })], [], [], trail)[0]!.title)
      .toBe('Asked because the heavy model still working, 2.0 s in → keep listening “Let me check.”')
  })

  it('shows the reason under "Asked because…" as "why: …", and marks the step as one that ran with the reason on', () => {
    const [row] = lightSteps([call({ why: 'They asked a question and stopped.', withReason: true })], [], [], trail)
    expect(row).toMatchObject({ why: 'They asked a question and stopped.', reasonOn: true })
    expect(row!.detail).not.toContain('why')
    const [none] = lightSteps([call({ withReason: true })], [], [], trail)
    expect(none).toMatchObject({ reasonOn: true })
    expect(none!.why).toBeUndefined()
    const [off] = lightSteps([call({})], [], [], trail)
    expect(off!.why).toBeUndefined()
    expect(off!.reasonOn).toBeUndefined()
  })

  it('shows the words a cap dropped on the check, so the cap can be judged', () => {
    const [row] = lightSteps([call({ choice: 'keep_listening', words: null, answer: null, asked: null, dropped: 'over the word cap', droppedWords: 'Let me go and check that for you now.' })], [], [], trail)
    expect(row!.detail).toContain('dropped: over the word cap “Let me go and check that for you now.” · hq checks again in 3 s')
  })

  it('marks a call whose answer was cut to its cap, beside the answer', () => {
    const [row] = lightSteps([call({ choice: 'hand_over', answer: 'One two three', answerCut: true, asked: 'x' })], [], [], trail)
    expect(row!.detail).toContain('would have answered “One two three” (not said) · answer cut to the word cap')
    expect(lightSteps([call({ choice: 'hand_over', answer: 'One', asked: 'x' })], [], [], trail)[0]!.detail).not.toContain('answer cut')
  })

  it('takes the turn\'s outcome onto its check: a hand over or a close ends the turn, a "not yet" keeps it open', () => {
    const turn = (outcome: 'closed' | 'handedOver' | 'notYet') => ({ id: 't', seq: 4, outcome, say: null, at: 1_000 })
    expect(lightSteps([call({})], [turn('handedOver')], [], trail)[0]).toMatchObject({ ends: 'handedOver' })
    expect(lightSteps([call({ choice: 'close_turn' })], [turn('closed')], [], trail)[0]).toMatchObject({ ends: 'closed' })
    const notYet = lightSteps([call({ choice: 'keep_listening', words: null })], [turn('notYet')], [], trail)[0]!
    expect(notYet).toMatchObject({ notYet: true, title: 'Asked because SOUND said finished → not yet: keep the turn open' })
    expect(notYet.ends).toBeUndefined()
  })

  it('makes the fallback SYSTEM\'s hand over, and the "not yet" limit SYSTEM\'s close', () => {
    const steps = lightSteps([call({ choice: null, overLimit: true })], [
      { id: 'f', seq: 4, outcome: 'fallback', say: 'One moment.', at: 1_000 },
      { id: 'b', seq: null, outcome: 'fallback', say: 'Bear with me.', at: 70_000 },
    ], [], trail)
    expect(steps.slice(1).map(s => [s.actor, s.tag, s.ends, s.title])).toEqual([
      ['SYSTEM', 'hand_over', 'fallback', 'No check answered in time → hand over with a stored hold “One moment.”'],
      ['SYSTEM', 'close', 'bound', 'Kept open to the limit after a “not yet” → hand over with a stored hold “Bear with me.”'],
    ])
  })

  it('makes the limit\'s own call LIGHT\'s close, asked because the limit was reached, and its stored fallback SYSTEM\'s close', () => {
    const t = emptyTrail()
    t.asks.push({ at: 5_000, call: 4, moment: 'quiet', quietMs: 30_000, keptOpen: true })
    const limit = call({ id: 'l', moment: 'limit', keptOpen: true, quietMs: 60_000, choice: 'close_turn', words: 'Okay, just say when.', answer: null, asked: null, ms: 600, at: 70_000 })
    const [light] = lightSteps([limit], [{ id: 't', seq: 4, outcome: 'closed', say: 'Okay, just say when.', at: 70_100 }], [], t)
    expect(light).toMatchObject({ actor: 'LIGHT', tag: 'close_turn', ends: 'limit', afterNotYet: true, at: 69_400 })
    expect(light!.title).toBe('Asked because the 60 s limit was reached after an invitation nobody answered → close the turn itself “Okay, just say when.” · calm')
    const stored = lightSteps([], [{ id: 's', seq: null, outcome: 'limitClosed', say: "I'll be here when you're ready.", at: 70_000 }], [], t)
    expect(stored.map(s => [s.actor, s.tag, s.ends, s.title])).toEqual([
      ['SYSTEM', 'close', 'limit', 'Kept open to the limit after an invitation nobody answered → closed with a stored closing line “I\'ll be here when you\'re ready.”'],
    ])
  })

  it('shows each line from when it began to play, the decision it came from, and whether it played to its end', () => {
    const t = emptyTrail()
    t.answers.push({ at: 1_100, call: 4, action: 'hand_over', lineId: 'L1', say: 'Let me check.' }, { at: 3_000, call: 5, action: 'keep_listening', lineId: 'L2', turn: 'fallback' })
    t.plays.push({ lineId: 'L1', text: 'Let me check.', start: 1_500, end: 2_700 }, { lineId: 'L2', text: 'One moment.', start: 3_100, end: 3_500 })
    const steps = lightSteps([call({})], [], [{ id: 'l1', lineId: 'L1', text: 'Let me check.', stored: false, at: 2_700 }], t)
    expect(steps.filter(s => s.tag === 'line').map(s => [s.actor, s.at, s.title, s.detail, s.from])).toEqual([
      ['LIGHT', 1_500, 'hold · “Let me check.”', 'tone: calm · played to its end · 1.2 s', 'light-c1'],
      ['SYSTEM', 3_100, 'hold · “One moment.”', 'a stored phrase, calm · stopped before its end · 0.4 s', 'system'],
    ])
  })
})
