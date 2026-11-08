import type { Prisma } from '@prisma/client'

/** No start time still to come: a task that may start now. */
export function notBeforeItsTime(now: Date): Prisma.TaskWhereInput {
  return { OR: [{ scheduleNextDueAt: null }, { scheduleNextDueAt: { lte: now } }] }
}
