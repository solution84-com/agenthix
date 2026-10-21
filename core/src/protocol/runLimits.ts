/**
 * Run limits — how long a run may take, and how many round trips with the model
 * an unattended run may make. hq decides the values (an org's defaults, which a
 * project may only tighten) and sends them in the run dispatch; the site
 * enforces them, so they hold when hq restarts.
 *
 * Platform-neutral like the rest of core: both apps agree here on the bounds,
 * the stricter-wins rule, and the words a stopped run records, so hq can tell a
 * run stopped by a limit from any other stop by its recorded error.
 */

/**
 * The limits one run carries. `turnLimit` is the value that applies when no
 * person started the run; the site applies it only then (`RunDispatchPayload.startedBy`).
 */
export type RunLimits = { timeLimitMinutes: number; turnLimit: number }

/** Out-of-the-box org values: an hour covers the 30-minute task timer this replaces with room for a long chat turn. */
export const DEFAULT_RUN_LIMITS: RunLimits = { timeLimitMinutes: 60, turnLimit: 100 }

export const RUN_TIME_LIMIT_MINUTES_BOUNDS = { min: 1, max: 24 * 60 } as const
export const RUN_TURN_LIMIT_BOUNDS = { min: 1, max: 1000 } as const

export type RunLimitKind = 'time' | 'turns'

/** What a run stopped by a limit records as its error. */
export const RUN_LIMIT_REASON_PREFIX = 'Run limit reached: '

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`

export function runLimitReason(kind: RunLimitKind, limits: RunLimits): string {
  return kind === 'time'
    ? `${RUN_LIMIT_REASON_PREFIX}the run was stopped after its time limit of ${plural(limits.timeLimitMinutes, 'minute')}.`
    : `${RUN_LIMIT_REASON_PREFIX}the run was stopped after its turn limit of ${plural(limits.turnLimit, 'turn')}.`
}

/** Is this recorded error the reason a limit stopped the run? */
export function isRunLimitReason(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.startsWith(RUN_LIMIT_REASON_PREFIX)
}

/**
 * The limits a run actually gets: for each, the stricter (lower) of the org's
 * value and the project's own choice. A project's choice is stored as it set it
 * and the org's word is final, so an org that tightens below it wins at use.
 */
export function effectiveRunLimits(
  org: RunLimits,
  project: { timeLimitMinutes?: number | null; turnLimit?: number | null } | null | undefined,
): RunLimits {
  return {
    timeLimitMinutes: Math.min(org.timeLimitMinutes, project?.timeLimitMinutes ?? org.timeLimitMinutes),
    turnLimit: Math.min(org.turnLimit, project?.turnLimit ?? org.turnLimit),
  }
}
