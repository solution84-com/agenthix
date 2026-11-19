/**
 * The light model's scripted set (plan task 5.4): each step scored against what the spec says, and the set run through
 * hq's own listening call with a scripted model — a scenario passes only when every step does.
 */
import { describe, expect, it } from 'vitest'
import type { LightScenarioResult } from '../types'
import { runLightScenario } from '../lightSet/run'
import { LIGHT_SCENARIOS } from '../lightSet/scenarios'
import { scoreLightStep, type StepOutcome } from '../lightSet/score'
import { ACCESS, json, scriptedModel, type Answer } from '../../../voice/playground/light/__tests__/fakes'

const outcome = (o: Partial<StepOutcome>): StepOutcome => ({
  choice: null, words: null, answer: null, asked: null, nextCheck: 2, turn: 'open', ms: 500, overLimit: false, ...o,
})

describe('scoring a light model step @SC-1840 @SC-2225', () => {
  it('passes the choice and the turn the spec wants, and says why it fails otherwise', () => {
    expect(scoreLightStep({ choices: ['hand_over'], turn: 'handedOver' }, outcome({ choice: 'hand_over', turn: 'handedOver' }))).toEqual({ pass: true, why: null })
    expect(scoreLightStep({ choices: ['close_turn'], turn: 'closed' }, outcome({ choice: 'hand_over', turn: 'handedOver' })))
      .toEqual({ pass: false, why: 'the turn ended (handedOver); wanted closed' })
    expect(scoreLightStep({ choices: ['keep_listening', 'acknowledge'], turn: 'open' }, outcome({ choice: 'invite' })))
      .toEqual({ pass: false, why: 'chose invite; wanted keep_listening or acknowledge' })
    expect(scoreLightStep({ choices: ['keep_listening'], turn: 'open' }, outcome({ overLimit: true })))
      .toEqual({ pass: false, why: 'no answer within the time limit' })
  })

  it('wants no choice where the bound decides', () => {
    expect(scoreLightStep({ choices: [], turn: 'fallback' }, outcome({ turn: 'fallback' })).pass).toBe(true)
  })

  it('has a scenario for each moment the brief names', () => {
    expect(LIGHT_SCENARIOS.map(s => s.id)).toEqual([
      'mid-sentence', 'sentence-ends', 'thinking-pause', 'finished-question', 'thanks', 'stop-talking', 'give-me-a-minute', 'long-wait',
      'style-hums-off', 'style-hums-fewer', 'style-patient', 'style-normal',
    ])
  })

  it('wants a listening style request handed over, never closed alone: the reply sets the style', () => {
    const want = LIGHT_SCENARIOS.find(s => s.id === 'style-patient')!.steps[0]!.expect
    expect(scoreLightStep(want, outcome({ choice: 'hand_over', turn: 'handedOver' })).pass).toBe(true)
    expect(scoreLightStep(want, outcome({ choice: 'close_turn', turn: 'closed' })).pass).toBe(false)
  })
})

/** A model that does what the spec wants for every scenario, except where `wrong` says. */
const good: [RegExp, Answer][] = [
  [/finished, and the answer has been worked out/, json({ action: 'acknowledge', say: 'Still on it.', next_check: 8 })],
  [/Melbourne|deploy/, json({ action: 'hand_over', asked: 'x', answer: 'y', hold: 'Let me check that.', next_check: 4 })],
  [/Great, thanks|Stop talking/, json({ action: 'close_turn', say: 'Sure.', next_check: 2 })],
  [/a minute/, json({ action: 'keep_listening', next_check: 25 })],
  [/stop humming|Fewer of those|Stop interrupting|hum again/, json({ action: 'hand_over', asked: 'how I listen', hold: 'Okay, one moment.', tone: 'warm' })],
]

async function run(rules: [RegExp, Answer][]) {
  const model = scriptedModel(rules)
  const results: LightScenarioResult[] = []
  for (const scenario of LIGHT_SCENARIOS) results.push(await runLightScenario(scenario, model, ACCESS))
  return { results }
}

describe('running the light model set @SC-1840 @SC-2225', () => {
  it('runs every scenario through the listening call, each step scored, the bound reached in give-me-a-minute', async () => {
    const { results } = await run(good)
    expect(results).toHaveLength(LIGHT_SCENARIOS.length)
    expect(results.filter(r => !r.pass).map(r => [r.scenarioId, r.steps.map(s => s.why)])).toEqual([])
    const minute = results.find(r => r.scenarioId === 'give-me-a-minute')!
    expect(minute.steps.map(s => s.turn)).toEqual(['open', 'open', 'fallback'])
    const handed = results.find(r => r.scenarioId === 'finished-question')!
    expect(handed.steps[0]).toMatchObject({ choice: 'hand_over', answer: 'y', asked: 'x', words: 'Let me check that.' })
    expect(results.find(r => r.scenarioId === 'style-patient')!.steps[0]).toMatchObject({ choice: 'hand_over', turn: 'handedOver', tone: 'warm' })
  })

  it('fails a scenario on one wrong step: "thanks" handed over', async () => {
    const { results } = await run([[/Great, thanks/, json({ action: 'hand_over', asked: 'a', answer: 'b', hold: 'One moment.', next_check: 2 })], ...good])
    const thanks = results.find(r => r.scenarioId === 'thanks')!
    expect(thanks).toMatchObject({ pass: false })
    expect(thanks.steps[0]!.why).toBe('the turn ended (handedOver); wanted closed')
  })
})
