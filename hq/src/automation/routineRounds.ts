/**
 * A routine's rounds (spec §3, adr-0092, adr-0104). A routine keeps exactly one
 * round waiting — a task created ahead of time for its next time. When that
 * time comes the scheduler, in one transaction:
 *
 *   1. claims the routine by compare-and-set on its stored next time, moving it
 *      to the time after, so overlapping ticks or two hq processes do it once;
 *   2. makes the waiting round's time a start time that is due now, so the
 *      start-time path (scheduledStart.ts) starts it in the same tick, as if its
 *      person pressed Run, whatever its column — or, with no agent, says so and
 *      leaves it for a person. A round someone already started is left alone:
 *      a task starts at most once on its own;
 *   3. creates the next round, for the time after, whatever became of the last.
 *
 * The time after is computed from now, so a time missed while hq was down
 * creates its round once, not once per time.
 */
import { prisma } from 'wasp/server'
import { Prisma, type Routine } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { dueBy } from './pulsePlan'
import { labelsOf, nextRoundAfter, roundFields, roundPlan } from './routineTemplate'

const logger = new Logger('RoutineRounds')

type Tx = Prisma.TransactionClient

/** Creates a round of `routine` for `at`, linked to it. Never queued: its time is still to come. */
export async function insertRound(tx: Tx, routine: Routine, at: Date) {
  const place = await roundFields(tx, routine)
  const agg = await tx.task.aggregate({ where: { projectId: routine.projectId }, _max: { number: true } })
  return tx.task.create({
    data: {
      title: routine.title,
      description: routine.description,
      priority: routine.priority,
      labels: labelsOf(routine.labels),
      projectId: routine.projectId,
      number: (agg._max.number ?? 0) + 1,
      ...place,
      ...roundPlan(at, routine.scheduleTimezone),
      runState: 'RUN_NONE',
      onBehalfOfUserId: routine.onBehalfOfUserId,
      routineId: routine.id,
      roundAt: at,
    },
  })
}

/** Serializable, as task creation is, so two rounds never take the same task number. */
export function inRoutineTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Creates every round that is due, one claim per routine. Returns how many routines moved on. */
export async function createRoundsDue(now: Date): Promise<number> {
  const due = await prisma.routine.findMany({
    where: { enabled: true, nextRoundAt: { lte: dueBy(now) } },
    orderBy: { nextRoundAt: 'asc' },
    take: 200,
  })
  let moved = 0
  const boards = new Set<string>()
  for (const routine of due) {
    try {
      const touched = await roundTimeReached(routine, now)
      if (touched) {
        moved++
        touched.forEach(b => boards.add(b))
      }
    } catch (err) {
      // Rolled back whole, so the next tick tries the same routine again.
      logger.error(`routine ${routine.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (boards.size > 0) {
    const { emitTaskUpdated } = await import('../server/socket')
    boards.forEach(b => emitTaskUpdated(b))
  }
  return moved
}

/**
 * A round nobody has started: no run was ever dispatched for it, and no start
 * was asked for — at most a column queued it for the pulse. Only such a round
 * is started at its time.
 */
export const NEVER_STARTED: Prisma.TaskWhereInput = {
  archived: false,
  runId: null,
  OR: [{ runState: 'RUN_NONE' }, { runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, runStartedBy: null }],
}

/** The boards a round changed on, or null when another tick had already claimed it. */
async function roundTimeReached(routine: Routine, now: Date): Promise<string[] | null> {
  const reached = routine.nextRoundAt!
  const next = nextRoundAfter(routine, new Date(Math.max(reached.getTime(), now.getTime())))
  return inRoutineTx(async tx => {
    const { count } = await tx.routine.updateMany({
      where: { id: routine.id, enabled: true, nextRoundAt: reached },
      data: { nextRoundAt: next },
    })
    if (count === 0) return null
    // Its time is now a start time that is due: the start-time path takes it from here.
    await tx.task.updateMany({
      where: { routineId: routine.id, roundAt: reached, ...NEVER_STARTED },
      data: { scheduleNextDueAt: reached },
    })
    const boards: string[] = []
    if (next) {
      const round = await insertRound(tx, routine, next)
      if (round.boardId) boards.push(round.boardId)
    }
    return boards
  })
}
