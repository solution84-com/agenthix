/**
 * A run's limits, watched while it runs (spec §7). The time limit starts when the
 * run starts working, not while it waits for a slot; the turn limit counts round
 * trips with the model and applies only to a run no person started. Either one
 * reached stops the run once, through the callback, with the limit it hit.
 *
 * A run is stopped when it goes past its turn limit: one allowed `n` turns ends
 * normally on its `n`th, and is stopped as the `n+1`th comes back.
 *
 * Turns per runtime: the Claude runtime counts each distinct model response the
 * CLI reports (one `assistant` message id); the OpenCode runtime counts each
 * step it finishes (`step-finish`).
 */
import type { RunLimitKind, RunLimits, RunStartedBy } from '@agenthix/core'

export interface RunLimitWatch {
  roundTrip(): void
  stop(): void
}

export function startRunLimitWatch(
  limits: RunLimits,
  startedBy: RunStartedBy | undefined,
  onLimit: (kind: RunLimitKind, limits: RunLimits) => void,
): RunLimitWatch {
  const turnsApply = (startedBy ?? 'person') !== 'person'
  let tripped = false
  let turns = 0
  const trip = (kind: RunLimitKind) => {
    if (tripped) return
    tripped = true
    onLimit(kind, limits)
  }
  const timer = setTimeout(() => trip('time'), limits.timeLimitMinutes * 60_000)
  timer.unref()
  return {
    roundTrip() {
      turns += 1
      if (turnsApply && turns > limits.turnLimit) trip('turns')
    },
    stop() {
      clearTimeout(timer)
    },
  }
}
