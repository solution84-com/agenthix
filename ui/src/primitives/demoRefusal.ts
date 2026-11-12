import { Children, isValidElement, type ReactNode } from 'react'

/**
 * How the public demo's refusals begin (hq's `demo/demoWords.ts` holds the full sentences): the demo's guard answers a
 * refused press with these words and `demo: true`. Such a refusal is final until the demo resets, so the attention
 * dialog that says it offers no Try again.
 */
export const DEMO_REFUSAL_WORDS = "The demo can't do this."

/** Whether a failure is the demo's refusal: the guard's answer carries `demo: true` (Wasp keeps it as the error's `data`). */
export function isDemoRefusal(failure: unknown): boolean {
  if (typeof failure !== 'object' || failure === null) return false
  const data = (failure as { data?: unknown }).data
  return typeof data === 'object' && data !== null && (data as { demo?: unknown }).demo === true
}

function textOf(node: ReactNode): string {
  return Children.toArray(node).map(c => {
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    return isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ''
  }).join('')
}

/** Whether words handed to the dialog are the demo's refusal, for a caller that kept only the failure's message. */
export function saysDemoRefusal(text: ReactNode): boolean {
  return textOf(text).includes(DEMO_REFUSAL_WORDS)
}
