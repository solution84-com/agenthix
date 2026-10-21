/**
 * The quiet line a task's thread gets when its task changes hands (the overview's task-thread rules, 6): the
 * thread carries on with the new agent. Pure.
 */
import { ASSIGN_AN_AGENT } from './lead'

export function takeoverLine(from: string | null, to: string | null): string | null {
  if (from === to) return null
  if (to && from) return `${to} took over from ${from}`
  if (to) return `${to} took over`
  return from ? `${from} is no longer assigned. ${ASSIGN_AN_AGENT}` : null
}
