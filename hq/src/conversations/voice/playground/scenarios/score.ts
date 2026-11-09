/**
 * Scoring one scenario's call against the behaviour it wants (plan task 4c.4). `hold` passes when the model called
 * keep_listening (a hold that wrote words first still passes, marked, since hq withdraws such words); `reply` when it
 * did not hold and wrote words; `quick` when it did not hold, called no tool and wrote words; `task` when it did not
 * hold and called start_work.
 */
import type { ScenarioWanted } from '../../../../shared/voicePlayground'

export type StepOutcome = { held: boolean; text: string; calls: readonly string[] }
export type Score = { pass: boolean; did: string; wroteFirst: boolean }

export const START_WORK = 'start_work'

export function didOf(o: StepOutcome): string {
  if (o.held) return 'held'
  if (o.calls.includes(START_WORK)) return 'called start_work'
  const other = o.calls.find(c => c !== 'keep_listening')
  if (other) return `called ${other}`
  return o.text.trim() ? 'answered' : 'said nothing'
}

export function scoreStep(wanted: ScenarioWanted, o: StepOutcome): Score {
  const words = o.text.trim() !== ''
  const did = didOf(o)
  const wroteFirst = o.held && words
  switch (wanted) {
    case 'hold': return { pass: o.held, did, wroteFirst }
    case 'reply': return { pass: !o.held && words, did, wroteFirst }
    case 'quick': return { pass: !o.held && o.calls.length === 0 && words, did, wroteFirst }
    case 'task': return { pass: !o.held && o.calls.includes(START_WORK), did, wroteFirst }
  }
}
