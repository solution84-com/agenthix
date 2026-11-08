/**
 * "Needs you" on the server: the rule the Tasks tool counts with
 * (`needsPerson` in @agenthix/ui, and `waitsForAgent` in pages/toolTaskRows),
 * for the board and timeline reads, which cannot import the browser's
 * component library. needsYou.test.ts holds the two to the same answer.
 */
import { NO_AGENT_REASON } from '../agents/taskExecutionReasons'

export type NeedsYouFields = { state: string; runState: string; runStateReason: string | null; assignedAgentId: string | null }

export function needsYou(t: NeedsYouFields): boolean {
  if (t.runState === 'RUN_BLOCKED') return true
  if (t.state === 'DONE') return false
  if (t.runState === 'RUN_FAILED') return true
  if (t.assignedAgentId) return false
  return t.runState === 'RUN_QUEUED'
    || (t.runState === 'RUN_NONE' && t.runStateReason === NO_AGENT_REASON)
}

export const NEEDS_YOU_SELECT = { state: true, runState: true, runStateReason: true, assignedAgentId: true } as const
