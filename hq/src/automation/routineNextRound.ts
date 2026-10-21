/**
 * A person acting on a routine's next round (spec §3): Run now takes it out of
 * waiting and runs it at once, while a fresh round waits for the same time, so
 * the schedule is unchanged; Skip this time removes it, and the routine creates
 * the round after. The callers check who may.
 */
import { RoutineError } from './routineTemplate'
import { NEVER_STARTED, inRoutineTx, insertRound } from './routineRounds'
import { boardsChanged, skipPast } from './routines'

const NONE_WAITING = 'This routine has no round waiting'
const ALREADY_STARTED = 'Its next round has already been started'

/** Run now's first half: the waiting round becomes a round of now, and a fresh one waits. Returns the round to run. */
export async function takeWaitingRoundNow(routineId: string, now: Date = new Date()): Promise<{ taskId: string }> {
  const { taskId, boards } = await inRoutineTx(async tx => {
    const routine = await tx.routine.findUnique({ where: { id: routineId } })
    if (!routine?.enabled || !routine.nextRoundAt) throw new RoutineError(NONE_WAITING)
    const waiting = await tx.task.findFirst({ where: { routineId, roundAt: routine.nextRoundAt } })
    if (!waiting) throw new RoutineError(NONE_WAITING)
    const untouched = await tx.task.count({ where: { id: waiting.id, runState: 'RUN_NONE', ...NEVER_STARTED } })
    if (untouched === 0) throw new RoutineError(ALREADY_STARTED)
    if (!waiting.assignedAgentId) throw new RoutineError('Its next round has no agent to run it')
    await tx.task.update({ where: { id: waiting.id }, data: { roundAt: now } })
    const fresh = await insertRound(tx, routine, routine.nextRoundAt)
    return { taskId: waiting.id, boards: [waiting.boardId, fresh.boardId] }
  })
  await boardsChanged(boards)
  return { taskId }
}

/** Skip this time: the waiting round is removed, unless someone already started it, and the routine moves on. */
export async function skipWaitingRound(routineId: string, now: Date = new Date()): Promise<void> {
  const boards = await inRoutineTx(async tx => {
    const routine = await tx.routine.findUnique({ where: { id: routineId } })
    if (!routine?.enabled || !routine.nextRoundAt) throw new RoutineError(NONE_WAITING)
    const at = routine.nextRoundAt
    const waiting = await tx.task.findFirst({ where: { routineId, roundAt: at } })
    const boards: string[] = []
    if (waiting) {
      const { count } = await tx.task.deleteMany({ where: { id: waiting.id, runState: 'RUN_NONE', ...NEVER_STARTED } })
      if (count === 0) throw new RoutineError(ALREADY_STARTED)
      boards.push(waiting.boardId)
    }
    return [...boards, ...(await skipPast(tx, routineId, at, now))]
  })
  await boardsChanged(boards)
}
