import type { Prisma } from '@prisma/client'

/** No start time and no round time still to come: a task that may start now. */
export function notBeforeItsTime(now: Date): Prisma.TaskWhereInput {
  return {
    AND: [
      { OR: [{ scheduleNextDueAt: null }, { scheduleNextDueAt: { lte: now } }] },
      { OR: [{ roundAt: null }, { roundAt: { lte: now } }] },
    ],
  }
}
