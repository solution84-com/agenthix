/**
 * A session's lifecycle state as it crosses the wire — the site owns it and
 * replicates it to hq's copy (person-scoped execution spec §4).
 *
 * Each array mirrors a Prisma enum of the same values in BOTH apps' schemas
 * (`SessionStatus`, `SessionClosedReason`). Core cannot import either app's
 * generated types, so the apps' zod validators feed from these arrays instead.
 */

export const SESSION_STATUSES = ['ACTIVE', 'EXPIRED', 'ARCHIVED', 'CLOSED'] as const
export type SessionStatusValue = (typeof SESSION_STATUSES)[number]

/**
 * Why a session is `CLOSED`. A closed conversation keeps its whole history in
 * our record; what is gone is the harness's own state, so the agent can no
 * longer continue it.
 *
 * - `HARNESS_STATE_MISSING` — the runtime reports that the harness session no
 *   longer exists in the runner's home (the pre-launch existence check).
 * - `LEFT_PROJECT`, `LEFT_ORGANISATION`, `PROJECT_DELETED` — membership ended
 *   and the site deleted the home that held it (`membership.ts`).
 */
export const SESSION_CLOSED_REASONS = [
  'HARNESS_STATE_MISSING',
  'LEFT_PROJECT',
  'LEFT_ORGANISATION',
  'PROJECT_DELETED',
] as const
export type SessionClosedReasonValue = (typeof SESSION_CLOSED_REASONS)[number]
