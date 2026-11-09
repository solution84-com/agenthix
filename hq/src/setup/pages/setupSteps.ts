import type { SetupResumeStep } from '../setupState'

/** Setup's steps (setup spec): You, Your organisation, AI (one step for models, hearing and speaking), then a last look. */
export type Step = 'you' | 'org' | 'ai' | 'review'

const ORDER: Step[] = ['you', 'org', 'ai', 'review']

// The step is carried in the address (?step=organisation), so a refresh and Back/Forward keep it.
const STEP_PARAM: Record<Step, string> = { you: 'you', org: 'organisation', ai: 'ai', review: 'review' }

export const stepParam = (step: Step): string => STEP_PARAM[step]
export const stepFromParam = (value: string | null): Step | null => (Object.keys(STEP_PARAM) as Step[]).find(k => STEP_PARAM[k] === value) ?? null

/** Where the progress bar stands: this step's number among the four. */
export function position(step: Step): { step: number; total: number } {
  return { step: Math.max(ORDER.indexOf(step), 0) + 1, total: ORDER.length }
}

export function neighbour(step: Step, by: 1 | -1): Step {
  const at = ORDER.indexOf(step)
  return ORDER[Math.min(Math.max((at < 0 ? 0 : at) + by, 0), ORDER.length - 1)]
}

/** Setup opens at the first step whose need is unmet (`getSetupResume`). AI is never one: it may be left for later (ADR-0160). */
export const stepOfResume = (resume: SetupResumeStep): Step => (resume === 'organisation' ? 'org' : resume)
