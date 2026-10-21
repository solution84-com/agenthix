import type { Prisma } from '@prisma/client'

/** No start time and no round time still to come: a task a column or the pulse may queue or start now. */
export function notBeforeItsTime(now: Date): Prisma.TaskWhereInput {
  return {
    AND: [
      { OR: [{ scheduleNextDueAt: null }, { scheduleNextDueAt: { lte: now } }] },
      { OR: [{ roundAt: null }, { roundAt: { lte: now } }] },
    ],
  }
}

/**
 * What the pulse and a run's end may start from an agent's line: a start someone
 * asked for (`runStartedBy` set — a person's Run goes ahead of any time) or a task
 * whose time has come. Whatever left a task queued with a time still to come, it
 * is never started early (spec §3).
 */
export function startableNow(now: Date): Prisma.TaskWhereInput {
  // Wrapped in AND so spreading it beside IN_LINE's own OR cannot overwrite that.
  return { AND: [{ OR: [{ runStartedBy: { not: null } }, notBeforeItsTime(now)] }] }
}
