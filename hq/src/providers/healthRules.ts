/**
 * How a provider's state moves (models from one place, part 1, *When a provider fails*; states S1–S5): pure, so
 * `health.ts` and its tests share one rule.
 *
 * - Any success: *works*.
 * - `auth` or `quota` from a real call asks for a check at once; the check's own `auth` or `quota` is the
 *   confirmation, and makes it *key refused* or *out of credit*.
 * - `unavailable` (no answer, or server errors), from calls or checks: three in a row, at least a minute apart, make
 *   it *unreachable*. Failures closer together count once. Only a working provider becomes unreachable: a refused key
 *   or no credit says more.
 * - A rate limit, a bad request, a cancel and Cloud's spending cap are not states.
 */
import {
  PROVIDER_CHECK_INTERVAL_MS, PROVIDER_RECHECK_INTERVAL_MS, PROVIDER_UNREACHABLE_AFTER_FAILURES,
  PROVIDER_UNREACHABLE_GAP_MS, type AiProviderState, type UpstreamErrorKind,
} from '@agenthix/core'

export type FailureKind = UpstreamErrorKind | 'cancelled'

export type Outcome =
  | { source: 'call' | 'check'; ok: true }
  | { source: 'call' | 'check'; ok: false; kind: FailureKind; detail?: string }

export type Health = { state: AiProviderState; failuresInRow: number; lastFailedAt: Date | null }

export type HealthStep = {
  health: Health
  /** The vendor's words when the state became one that is not working. */
  detail: string | null
  worked: boolean
  /** A real call failed in a way a check can confirm: check at once. */
  checkNow: boolean
}

export function nextHealth(current: Health, outcome: Outcome, now: Date): HealthStep {
  const same = { health: current, detail: null, worked: false, checkNow: false }
  if (outcome.ok) return { health: { state: 'works', failuresInRow: 0, lastFailedAt: null }, detail: null, worked: true, checkNow: false }
  const detail = outcome.detail ?? null
  switch (outcome.kind) {
    case 'auth':
    case 'quota':
      if (outcome.source === 'call') return { ...same, checkNow: true }
      return { ...same, health: { ...current, state: outcome.kind === 'auth' ? 'key_refused' : 'out_of_credit' }, detail }
    case 'unavailable': {
      const counted = current.lastFailedAt === null || now.getTime() - current.lastFailedAt.getTime() >= PROVIDER_UNREACHABLE_GAP_MS
      if (!counted) return same
      const failuresInRow = current.failuresInRow + 1
      const state = current.state === 'works' && failuresInRow >= PROVIDER_UNREACHABLE_AFTER_FAILURES ? 'unreachable' : current.state
      return { health: { state, failuresInRow, lastFailedAt: now }, detail, worked: false, checkNow: outcome.source === 'call' }
    }
    default:
      return same
  }
}

/** Whether a provider's check is due: hourly while it works, every five minutes while not. Cloud's are its answers. */
export function checkDue(p: { state: AiProviderState; lastCheckedAt: Date | null }, now: Date): boolean {
  if (p.state === 'not_available' || p.state === 'disconnected') return false
  if (!p.lastCheckedAt) return true
  const every = p.state === 'works' ? PROVIDER_CHECK_INTERVAL_MS : PROVIDER_RECHECK_INTERVAL_MS
  return now.getTime() - p.lastCheckedAt.getTime() >= every
}
