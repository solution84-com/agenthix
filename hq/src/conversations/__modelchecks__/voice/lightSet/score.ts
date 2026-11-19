/**
 * Scoring one step of a scripted light model scenario (plan task 5.4) against what the spec says should happen: how
 * the turn ended (or that it stayed open), and the choice among those that pass.
 * A step the bound or the fallback decides needs no choice.
 */
import type { LightExpect, LightStepResult } from '../types'

export type StepOutcome = Omit<LightStepResult, 'pass' | 'why'>

export function scoreLightStep(expect: LightExpect, o: StepOutcome): Pick<LightStepResult, 'pass' | 'why'> {
  if (o.turn !== expect.turn) {
    const got = o.turn === 'open' ? 'the turn stayed open' : `the turn ended (${o.turn})`
    return { pass: false, why: `${got}; wanted ${expect.turn === 'open' ? 'it open' : expect.turn}` }
  }
  if (expect.choices.length > 0) {
    if (!o.choice) return { pass: false, why: o.overLimit ? 'no answer within the time limit' : 'no answer' }
    if (!expect.choices.includes(o.choice)) return { pass: false, why: `chose ${o.choice}; wanted ${expect.choices.join(' or ')}` }
  }
  return { pass: true, why: null }
}
