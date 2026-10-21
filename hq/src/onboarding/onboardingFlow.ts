/**
 * The steps of onboarding (getting-in spec, Onboarding): Join, You, Model access
 * only when needed, then a last look. The indicator counts the first three; the
 * last look is not one of them. The step is in the address (`?step=`).
 */
export type Step = 'join' | 'you' | 'model' | 'review'

const KNOWN: Step[] = ['join', 'you', 'model', 'review']

/** Anything unknown starts after Join, since Join is where the account is made. */
export function stepFromParam(value: string | null, needsModel: boolean): Step {
  const step = KNOWN.find(k => k === value) ?? 'you'
  return step === 'model' && !needsModel ? 'review' : step
}

/** The counted steps, in order. */
export const countedSteps = (needsModel: boolean): Step[] => (needsModel ? ['join', 'you', 'model'] : ['join', 'you'])

export const STEP_NAME: Record<Step, string> = { join: 'Join', you: 'You', model: 'Model access', review: 'Last look' }

export function previousStep(step: Step, needsModel: boolean): Step | null {
  const order: Step[] = [...countedSteps(needsModel), 'review']
  const at = order.indexOf(step)
  return at > 0 ? order[at - 1] : null
}

export function nextStep(step: Step, needsModel: boolean): Step {
  const order: Step[] = [...countedSteps(needsModel), 'review']
  return order[Math.min(order.indexOf(step) + 1, order.length - 1)]
}
