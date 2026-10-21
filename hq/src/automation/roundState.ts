/**
 * What became of a routine's round, in the words its squares and its list use
 * (spec §3): done, failed, needs you, running, or waiting for its time. Pure, so
 * the routine, the Routines lists and the failing-streak notice share one rule.
 */
import type { RoundState } from '../shared/routineTypes'

export type RoundFacts = {
  status: string
  runState: string
  /** Its round time; null once unlinked from its time. */
  roundAt: Date | null
}

export function roundState(r: RoundFacts, now: Date): RoundState {
  if (r.status === 'DONE') return 'done'
  if (r.runState === 'RUN_FAILED') return 'failed'
  if (r.runState === 'RUN_ACTIVE' || r.runState === 'RUN_QUEUED' || r.runState === 'RUN_THROTTLED') return 'running'
  if (r.runState === 'RUN_NONE' && r.roundAt && r.roundAt.getTime() > now.getTime()) return 'waiting'
  // Blocked on a person, or its time came and it is neither done nor going.
  return 'needsYou'
}

/** How many failed rounds in a row tell the routine's person (spec §3). */
export const FAILING_STREAK = 3

/**
 * What the failing-streak notice should do, from the rounds newest first: raise
 * it when the newest rounds that have come to something are FAILING_STREAK
 * failures in a row; clear it once one of those is done — a new round, or a
 * failed one run again; otherwise leave it as it is. Rounds still running or
 * waiting are left out.
 */
export function streakVerdict(statesNewestFirst: RoundState[]): 'raise' | 'clear' | 'keep' {
  const settled = statesNewestFirst.filter(s => s !== 'running' && s !== 'waiting')
  const newest = settled.slice(0, FAILING_STREAK)
  if (newest.length === FAILING_STREAK && newest.every(s => s === 'failed')) return 'raise'
  return newest.includes('done') ? 'clear' : 'keep'
}
