import type { SetupResumeStep } from '../setupState'

/** Setup's steps (setup spec): the organisation first, then how agents reach AI, whose choice decides which steps follow. */
export type Step = 'you' | 'choice' | 'model' | 'voice' | 'org' | 'review'
export type Path = 'cloud' | 'keys' | 'later'

const ORDER: Record<Path, Step[]> = {
  cloud: ['you', 'org', 'choice', 'review'],
  keys: ['you', 'org', 'choice', 'model', 'voice', 'review'],
  later: ['you', 'org', 'choice', 'review'],
}

// The step is carried in the address (?step=organisation), so a refresh and Back/Forward keep it.
const STEP_PARAM: Record<Step, string> = { you: 'you', choice: 'choice', model: 'model', voice: 'voice', org: 'organisation', review: 'review' }

export const stepParam = (step: Step): string => STEP_PARAM[step]
export const stepFromParam = (value: string | null): Step | null => (Object.keys(STEP_PARAM) as Step[]).find(k => STEP_PARAM[k] === value) ?? null
export const pathFromParam = (value: string | null): Path | null => (value === 'cloud' || value === 'keys' || value === 'later' ? value : null)

/** Where the progress bar stands: this step's number among the steps of the chosen path. */
export function position(path: Path, step: Step): { step: number; total: number } {
  const order = ORDER[path]
  return { step: Math.max(order.indexOf(step), 0) + 1, total: order.length }
}

export function neighbour(path: Path, step: Step, by: 1 | -1): Step {
  const order = ORDER[path]
  const at = order.indexOf(step)
  return order[Math.min(Math.max((at < 0 ? 0 : at) + by, 0), order.length - 1)]
}

/** Setup opens at the first step whose need is unmet (`getSetupResume`). */
export const stepOfResume = (resume: SetupResumeStep): Step => (resume === 'organisation' ? 'org' : resume)
