/**
 * The one scheduler in hq (adr-0088). At the top of every minute, and at once
 * when nudged, it asks the database what is due and starts it:
 *
 *   1. closes every pulse round whose tasks have all finished, storing when the
 *      next pulse is due;
 *   2. moves every routine whose round's time has come on to its next round
 *      (routineRounds.ts), making the round's time a start time that is due;
 *   3. starts every scheduled task that is due — a routine's round among them,
 *      in the same tick (adr-0104);
 *   4. fires every pulse that is due and has queued work;
 *   5. raises or clears the notice of each routine whose rounds changed
 *      (routineFailing.ts) — a run's end nudges a tick.
 *
 * "Due" means due within the tick's own minute (pulsePlan.ts `dueBy`).
 *
 * Nothing about when work starts is held here: each item's due time is in the
 * database and each start is claimed by a compare-and-set, so a restart loses
 * nothing and two hq processes start an item once. On boot it recomputes every
 * pulse's due time from the stored round ends. Follows the shape of hq's other
 * background sweeps (packageContentSweep, previewSweep): started once from
 * setup, timers unref'd so they never hold the process open.
 */
import { Logger } from '../server/utils/logger'
import { loadOrgAutomation, recomputePulseDueTimes } from './automationStore'
import { closeFinishedRounds, firePulsesDue } from './pulse'
import { startSchedulesDue } from './scheduledStart'
import { createRoundsDue } from './routineRounds'
import { checkFailingRoutines } from './routineFailing'
import { setSchedulerWake } from './schedulerNudge'
import { noteSchedulerTick } from '../diagnostics/hqHealth'
import { recordError } from '../diagnostics/recordedErrors'
import { SCHEDULER_FAILED } from '../diagnostics/errorAdvice'

const logger = new Logger('Scheduler')

/** A tick taking longer than a minute overlaps the next; correct, but a defect to find (adr-0088). */
const SLOW_TICK_MS = 60_000

export async function tick(now: Date = new Date()): Promise<void> {
  const org = await loadOrgAutomation()
  const closed = await closeFinishedRounds(org, now)
  const routines = await createRoundsDue(now)
  const scheduled = await startSchedulesDue(org, now)
  const fired = await firePulsesDue(org, now)
  await checkFailingRoutines(now).catch(err => logger.error(`checking failing routines failed: ${err instanceof Error ? err.message : String(err)}`))
  if (closed + scheduled + routines + fired > 0) {
    logger.info(`tick: ${closed} round(s) closed, ${scheduled} scheduled start(s), ${routines} routine round(s), ${fired} pulse(s)`)
  }
}

/** Milliseconds from `now` to the top of the next minute. */
export function msToNextMinute(now: Date): number {
  return 60_000 - (now.getTime() % 60_000)
}

let minuteTimer: NodeJS.Timeout | null = null
let running = false
let again = false
let soon: NodeJS.Timeout | null = null

async function runTick(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  const started = Date.now()
  try {
    await tick()
    noteSchedulerTick(true)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    logger.error(`tick failed: ${why}`)
    noteSchedulerTick(false)
    void recordError({ origin: 'scheduler', subject: 'tick', advice: SCHEDULER_FAILED, detail: why })
  } finally {
    running = false
    const took = Date.now() - started
    if (took > SLOW_TICK_MS) logger.warn(`tick took ${Math.round(took / 1000)}s — longer than a minute`)
  }
  if (again) {
    again = false
    void runTick()
  }
}

function scheduleNextMinute(): void {
  minuteTimer = setTimeout(() => {
    void runTick()
    scheduleNextMinute()
  }, msToNextMinute(new Date()))
  minuteTimer.unref?.()
}

/** A nudge coalesces with any other in the same moment and with a tick already running. */
function wake(): void {
  if (soon) return
  soon = setTimeout(() => {
    soon = null
    void runTick()
  }, 0)
  soon.unref?.()
}

export function startScheduler(): void {
  if (minuteTimer) return
  setSchedulerWake(wake)
  recomputePulseDueTimes()
    .catch(err => logger.error(`recomputing pulse due times at boot failed: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => void runTick())
  scheduleNextMinute()
}

export function stopScheduler(): void {
  if (minuteTimer) clearTimeout(minuteTimer)
  if (soon) clearTimeout(soon)
  minuteTimer = null
  soon = null
  setSchedulerWake(null)
}
