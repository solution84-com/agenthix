/**
 * A routine's firings (adr-0177, adr-0088): each starts one run of its agent with its instructions, through the same
 * dispatch as every run with no task (routineDispatch.ts).
 *
 * A scheduled firing is claimed by compare-and-set on the routine's stored next due time, moved on in the same write
 * to the time after, so two ticks or two hq processes fire it once; a time missed while hq was down fires once, not
 * once per time missed. The routine fires as it is when the claim is made: a change saved after it applies from the
 * next firing.
 *
 * At most one run of a routine goes at a time. Whether one is going, and taking the place for a new one, happen under
 * a lock on the routine, so a firing and a person's Run now never both start one: a scheduled firing that finds one
 * going is skipped and listed as skipped; Run now is refused. A run whose end was never heard of stops counting as
 * going once its time limit, and a margin, have passed.
 */
import { prisma } from 'wasp/server'
import { Prisma, type Routine, type RoutineRun } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { personMayWorkInProject } from '../projects/taskOnBehalfOf'
import { dueBy } from './dueTime'
import { ROUTINE_LOST_ACCESS_REASON, RoutineError, nextDueAfter } from './routines'
import { dispatchRoutineRun } from './routineDispatch'
import { checkRoutineFailing } from './routineFailing'

const logger = new Logger('RoutineFiring')

export type FiringTrigger = { kind: 'schedule'; dueAt: Date } | { kind: 'person'; userId: string }

/** Past a run's time limit by this much, with no word of its end, it no longer counts as going. */
export const LOST_RUN_MARGIN_MS = 10 * 60_000
const LOST_RUN_REASON = 'No word of its end came from its site; it is taken as ended'

/** Claims every routine that is due and fires it. Returns how many fired (a skipped firing counts). */
export async function fireRoutinesDue(now: Date): Promise<number> {
  const due = await prisma.routine.findMany({
    where: { enabled: true, nextDueAt: { lte: dueBy(now) } },
    orderBy: { nextDueAt: 'asc' },
    select: { id: true, nextDueAt: true, cron: true, timezone: true },
    take: 200,
  })
  let fired = 0
  for (const r of due) {
    try {
      const claimed = await claimDue(r, now)
      if (!claimed) continue
      fired++
      await fire(claimed, { kind: 'schedule', dueAt: r.nextDueAt! }, now)
    } catch (err) {
      logger.error(`routine ${r.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return fired
}

/**
 * Moves the routine's due time on, if it is still the one read; null when another tick claimed it, or a change moved
 * or cleared it first. The row's lock is held from the claim to the read, so what is fired is the routine as it was
 * claimed; a schedule changed in between to the same time is read here and its next time taken from the new rule.
 */
export async function claimDue(r: Pick<Routine, 'id' | 'nextDueAt' | 'cron' | 'timezone'>, now: Date): Promise<Routine | null> {
  const reached = r.nextDueAt!
  const after = new Date(Math.max(reached.getTime(), now.getTime()))
  return prisma.$transaction(async tx => {
    const { count } = await tx.routine.updateMany({
      where: { id: r.id, enabled: true, nextDueAt: reached },
      data: { nextDueAt: nextDueAfter(r, after) },
    })
    if (count === 0) return null
    const claimed = await tx.routine.findUniqueOrThrow({ where: { id: r.id } })
    const next = nextDueAfter(claimed, after)
    if (next?.getTime() !== claimed.nextDueAt?.getTime()) return tx.routine.update({ where: { id: r.id }, data: { nextDueAt: next } })
    return claimed
  })
}

/** A person's Run now: one run on their behalf, refused while the routine's last run is going. */
export async function runRoutineNow(routineId: string, userId: string, now: Date = new Date()): Promise<RoutineRun> {
  const routine = await prisma.routine.findUnique({ where: { id: routineId } })
  if (!routine) throw new RoutineError('Routine not found')
  if (!routine.enabled) throw new RoutineError('It is off: switch it on to run it. Nothing was changed.')
  return fire(routine, { kind: 'person', userId }, now)
}

/** Fires a routine once: a run started, a firing skipped, or one that could not start, each recorded. */
export async function fire(routine: Routine, trigger: FiringTrigger, now: Date): Promise<RoutineRun> {
  const personId = trigger.kind === 'person' ? trigger.userId : routine.onBehalfOfUserId
  const base = {
    routineId: routine.id, dueAt: trigger.kind === 'schedule' ? trigger.dueAt : null,
    startedByUserId: trigger.kind === 'person' ? trigger.userId : null, onBehalfOfUserId: personId,
  }

  if (trigger.kind === 'schedule' && !(await personMayWorkInProject(routine.projectId, personId))) {
    await prisma.routine.updateMany({
      where: { id: routine.id, onBehalfOfUserId: personId, enabled: true },
      data: { enabled: false, nextDueAt: null, pausedReason: ROUTINE_LOST_ACCESS_REASON },
    })
    return settled(await record(base, 'FAILED', `It was switched off: ${ROUTINE_LOST_ACCESS_REASON}`))
  }
  const assigned = routine.agentId
    ? await prisma.projectAgent.findUnique({ where: { projectId_agentId: { projectId: routine.projectId, agentId: routine.agentId } }, select: { agentId: true } })
    : null
  const agent = assigned ? await prisma.agent.findUnique({ where: { id: assigned.agentId } }) : null
  if (!agent) {
    const why = routine.agentId ? 'Its agent is no longer assigned to this project' : 'It has no agent to run it'
    if (trigger.kind === 'person') throw new RoutineError(`${why}: choose one first. Nothing was changed.`)
    return settled(await record(base, 'FAILED', why))
  }

  const taken = await takePlace(routine.id, base, now)
  if (taken.going) {
    if (trigger.kind === 'person') {
      throw new RoutineError(`Run ${taken.going.number} is still going: this routine runs one run at a time. Press Run now again once it has ended. Nothing was changed.`)
    }
    return taken.run
  }
  const run = taken.run
  try {
    const started = await dispatchRoutineRun({
      routine, agent, routineRunId: run.id, number: run.number!, personId,
      startedBy: trigger.kind === 'person' ? 'person' : 'schedule',
    })
    // A frame may have moved it on already; only a run still starting becomes running here.
    await prisma.routineRun.updateMany({ where: { id: run.id, runId: null }, data: { runId: started.runId } })
    await prisma.routineRun.updateMany({ where: { id: run.id, state: 'STARTING' }, data: { state: 'RUNNING' } })
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    logger.warn(`routine ${routine.id} run ${run.number} did not start: ${why}`)
    await prisma.routineRun.updateMany({ where: { id: run.id, state: 'STARTING' }, data: { state: 'FAILED', reason: why, endedAt: new Date() } })
    await checkRoutineFailing(routine.id)
  }
  return prisma.routineRun.findUniqueOrThrow({ where: { id: run.id } })
}

type Base = Pick<RoutineRun, 'routineId' | 'dueAt' | 'startedByUserId' | 'onBehalfOfUserId'>

function record(base: Base, state: 'FAILED' | 'SKIPPED', reason: string): Promise<RoutineRun> {
  return prisma.routineRun.create({ data: { ...base, state, reason, endedAt: new Date() } })
}

async function settled(run: RoutineRun): Promise<RoutineRun> {
  await checkRoutineFailing(run.routineId)
  return run
}

/** A run going counts until its end is heard of, or its time limit and the margin have passed. */
export function isLost(run: Pick<RoutineRun, 'startedAt' | 'timeLimitMinutes'>, now: Date): boolean {
  if (run.timeLimitMinutes === null) return false
  return now.getTime() > run.startedAt.getTime() + run.timeLimitMinutes * 60_000 + LOST_RUN_MARGIN_MS
}

/**
 * Under the routine's lock: the run going, if one is (a scheduled firing then recorded as skipped), or the next
 * numbered run, starting. A run going that was lost is settled first, as failed.
 */
async function takePlace(routineId: string, base: Base, now: Date): Promise<{ going: RoutineRun | null; run: RoutineRun }> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('routine-run'), hashtext(${routineId}))`
    const going = await tx.routineRun.findMany({ where: { routineId, state: { in: ['STARTING', 'RUNNING'] } } })
    const lost = going.filter(r => isLost(r, now))
    if (lost.length > 0) {
      await tx.routineRun.updateMany({
        where: { id: { in: lost.map(r => r.id) } }, data: { state: 'FAILED', reason: LOST_RUN_REASON, endedAt: now },
      })
    }
    const live = going.find(r => !isLost(r, now)) ?? null
    if (live) {
      if (base.startedByUserId) return { going: live, run: live }
      const run = await tx.routineRun.create({
        data: { ...base, state: 'SKIPPED', reason: `Run ${live.number} was still going`, endedAt: now },
      })
      return { going: live, run }
    }
    const { _max } = await tx.routineRun.aggregate({ where: { routineId }, _max: { number: true } })
    const run = await tx.routineRun.create({ data: { ...base, state: 'STARTING', number: (_max.number ?? 0) + 1, startedAt: now } })
    return { going: null, run }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
