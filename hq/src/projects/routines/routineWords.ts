/**
 * The words and marks of the Routines screens (spec D7, D15, D22, N6; the Routines design): a run's mark, how a
 * routine has been going, when it fires next, why Run now is greyed, and what saving asks first. Pure, so the list,
 * a routine's page and the Routines place across projects say each thing the same way.
 */
import { nextCronTime, type ExecutionState } from '@agenthix/core'
import { LAST_RUNS, type RoutineRunView, type RoutineSummary } from '../../shared/routineTypes'
import { costText } from '../workroom/workroomWords'

/** A run's ending as its mark draws it: a shape for each, never colour alone. */
export type RunMark = 'finished' | 'failed' | 'asked' | 'skipped' | 'going' | 'stopped'

export const MARK_WORDS: Record<RunMark, string> = {
  finished: 'Finished', failed: 'Failed', asked: 'Needs you', skipped: 'Skipped', going: 'Running', stopped: 'Stopped',
}

export const isGoing = (r: Pick<RoutineRunView, 'state'>): boolean => r.state === 'STARTING' || r.state === 'RUNNING'

export function runMark(r: Pick<RoutineRunView, 'state' | 'ask'>): RunMark {
  if (isGoing(r)) return 'going'
  if (r.ask) return 'asked'
  if (r.state === 'SKIPPED') return 'skipped'
  if (r.state === 'FAILED') return 'failed'
  if (r.state === 'STOPPED') return 'stopped'
  return 'finished'
}

/** The run still going, if any: a firing now would be skipped. */
export const goingRun = (r: Pick<RoutineSummary, 'lastRuns'>): RoutineRunView | null => r.lastRuns.find(isGoing) ?? null

/** Its newest run that came to anything, skipped firings aside. */
const newestRun = (r: Pick<RoutineSummary, 'lastRuns'>): RoutineRunView | null => r.lastRuns.find(run => run.state !== 'SKIPPED') ?? null

/** The run waiting for its person, when the newest run ended asking. */
export function askingRun(r: Pick<RoutineSummary, 'lastRuns'>): RoutineRunView | null {
  const run = newestRun(r)
  return run && !isGoing(run) && run.ask ? run : null
}

/** How many of its newest runs failed in a row (skipped firings aside). */
export function failedInARow(r: Pick<RoutineSummary, 'lastRuns'>): number {
  let n = 0
  for (const run of r.lastRuns) {
    if (run.state === 'SKIPPED') continue
    if (run.state !== 'FAILED') break
    n++
  }
  return n
}

/** The ring its agent's avatar carries (D18): running, needs you, or failed its last run. */
export function routineRing(r: Pick<RoutineSummary, 'lastRuns'>): ExecutionState | null {
  if (goingRun(r)) return 'RUNNING'
  if (askingRun(r)) return 'NEEDS_YOU'
  return failedInARow(r) > 0 ? 'FAILED' : null
}

export const runName = (r: Pick<RoutineRunView, 'number'>): string => (r.number ? `Run ${r.number}` : 'Skipped')

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Last ten firings: 7 finished, 1 skipped, 1 failed, 1 needing you", oldest first as the marks are. */
export function marksLabel(runs: RoutineRunView[]): string {
  if (runs.length === 0) return 'No runs yet'
  const count = new Map<RunMark, number>()
  for (const r of runs) count.set(runMark(r), (count.get(runMark(r)) ?? 0) + 1)
  const order: RunMark[] = ['finished', 'going', 'skipped', 'failed', 'stopped', 'asked']
  const parts = order.filter(m => count.get(m)).map(m => `${count.get(m)} ${m === 'asked' ? 'needing you' : MARK_WORDS[m].toLowerCase()}`)
  return `Last ${runs.length === 1 ? 'firing' : `${runs.length} firings`}: ${parts.join(', ')}`
}

/** The average cost of its runs whose cost is known; null when none is. */
export function averageCost(runs: RoutineRunView[], costOf: (routineRunId: string) => number | undefined): number | null {
  const known = runs.flatMap(r => { const c = costOf(r.id); return c === undefined ? [] : [c] })
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null
}

/** "about $0.02 a run"; null when no run's cost is known. */
export const perRunWords = (cost: number | null): string | null => (cost === null ? null : `about ${costText(cost)} a run`)

/**
 * How it has been going, beside its marks: "10 of 10 finished", "9 of the last 10 finished", "7 finished · 1 skipped
 * · 1 failed · asked you once". A routine that keeps failing is said under `failing`, with why.
 */
export function goingWords(runs: RoutineRunView[]): { failing: string | null; reason: string | null; counts: string } {
  const failed = failedInARow({ lastRuns: runs })
  const newest = runs.find(r => r.state !== 'SKIPPED')
  const failing = failed === 0 ? null : failed === 1 ? 'Failed its last run' : `Failed the last ${failed} times`
  const reason = failing && newest?.reason ? newest.reason : null
  const marks = runs.map(runMark)
  const n = (m: RunMark) => marks.filter(x => x === m).length
  const ended = runs.length - n('going')
  const ok = n('finished')
  if (ended === 0) return { failing, reason, counts: runs.length ? 'Its first run is going' : 'No runs yet' }
  let counts: string
  if (n('skipped') + n('failed') + n('stopped') === 0 && n('asked') <= 1) {
    counts = runs.length >= LAST_RUNS ? `${ok} of the last ${ended} finished` : `${ok} of ${ended} finished`
  } else {
    counts = [
      ok ? `${ok} finished` : null,
      n('skipped') ? `${n('skipped')} skipped` : null,
      n('failed') ? `${n('failed')} failed` : null,
      n('stopped') ? `${n('stopped')} stopped` : null,
      n('asked') ? (n('asked') === 1 ? 'asked you once' : `asked you ${n('asked')} times`) : null,
    ].filter(Boolean).join(' · ')
  }
  return { failing, reason, counts }
}

/** "16 min", "40 s", "1 h 5 min". */
export function spanWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
}

const DAY = 24 * 60 * 60 * 1000
const hhmm = (d: Date, timeZone?: string) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })

/** "Today 14:00", "Sat 02:00", "Mon 10 Nov 09:00" — a time in the viewer's day, or in `timeZone`'s. */
export function whenWords(at: Date, now: Date, opts: { timeZone?: string; withDate?: boolean } = {}): string {
  const tz = opts.timeZone
  const dayKey = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: tz })
  if (!opts.withDate && dayKey(at) === dayKey(now)) return `Today ${hhmm(at, tz)}`
  const weekday = at.toLocaleDateString('en-GB', { weekday: 'short', timeZone: tz })
  if (!opts.withDate && at.getTime() - now.getTime() < 6 * DAY) return `${weekday} ${hhmm(at, tz)}`
  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz })
  return `${weekday} ${date} ${hhmm(at, tz)}`
}

/**
 * Under its schedule: "Running · 16 min", "next in 2 h 14 min", "next Mon 09:00", or why it is not coming. The time is
 * in the routine's own timezone, as its rule reads.
 */
export function nextWords(r: Pick<RoutineSummary, 'enabled' | 'nextDueAt' | 'lastRuns' | 'timezone'>, now: Date): { text: string; live: boolean } {
  const going = goingRun(r)
  if (going) return { text: `Running · ${spanWords(now.getTime() - new Date(going.startedAt).getTime())}`, live: true }
  if (!r.enabled) return { text: 'Off', live: false }
  if (!r.nextDueAt) return { text: 'No time is coming', live: false }
  const at = new Date(r.nextDueAt)
  const ms = at.getTime() - now.getTime()
  if (ms <= 0) return { text: 'due now', live: false }
  return { text: ms < DAY ? `next in ${spanWords(ms)}` : `next ${whenWords(at, now, { timeZone: r.timezone })}`, live: false }
}

/** "2 runs, both finished", "No runs yet", "10 runs, 9 finished". */
function runsTally(runs: RoutineRunView[]): string {
  const ran = runs.filter(r => r.state !== 'SKIPPED')
  if (ran.length === 0) return 'no runs yet'
  const ok = ran.filter(r => runMark(r) === 'finished').length
  const all = ran.length === 2 && ok === 2 ? 'both finished' : ok === ran.length ? 'all finished' : `${ok} finished`
  return `${plural(ran.length, 'run')}, ${ran.length === 1 && ok === 1 ? 'finished' : all}`
}

/** A switched-off routine's one line: "At 07:00 on the 1st of every month · off · 2 runs, both finished". */
export function offWords(r: Pick<RoutineSummary, 'scheduleWords' | 'cron' | 'pausedReason' | 'lastRuns'>): string {
  return [r.scheduleWords ?? r.cron, r.pausedReason ? `off: ${r.pausedReason}` : 'off', runsTally(r.lastRuns)].join(' · ')
}

export type Me = { id: string; name: string | null }

const personName = (p: { userId: string; username: string | null }, me: Me) =>
  p.userId === me.id ? `${me.name ?? p.username ?? 'you'} (you)` : p.username ?? 'someone who has left'

/** "Writer · on behalf of Sam Okafor (you)". */
export function whoWords(r: Pick<RoutineSummary, 'agent' | 'onBehalfOf'>, me: Me): string {
  return `${r.agent?.name ?? 'No agent'} · on behalf of ${personName(r.onBehalfOf, me)}`
}

export const onBehalfWords = (r: Pick<RoutineSummary, 'onBehalfOf'>, me: Me): string => personName(r.onBehalfOf, me)

/** Why Run now is greyed (N6, D15): it may not be changed, it is off, or its last run is still going. */
export function runNowWhy(r: Pick<RoutineSummary, 'canChange' | 'enabled' | 'lastRuns' | 'agent'>, viewerWhy: string): string | undefined {
  if (!r.canChange) return viewerWhy
  if (!r.enabled) return 'It is off: turn it on to run it'
  if (!r.agent) return 'It has no agent: choose one to run it'
  const going = goingRun(r)
  if (going) return `${going.number ? `Run ${going.number}` : 'Its last run'} is still going`
  return undefined
}

/** Run now's tooltip when it can be pressed: whose run it is (N6). */
export const RUN_NOW_TITLE = 'Run it once now, on your behalf; it stays on behalf of whoever last changed it'

/** Whether saving a change moves whose behalf the routine runs on, and so asks first (N6). */
export const savingAsks = (r: Pick<RoutineSummary, 'onBehalfOf'>, me: Me): boolean => r.onBehalfOf.userId !== me.id

/** What the save asks: "This routine will now run on your behalf (Sam Okafor), not Kai Mensah's." */
export function askWords(r: Pick<RoutineSummary, 'onBehalfOf'>, me: Me): string {
  const them = r.onBehalfOf.username ? `${r.onBehalfOf.username}'s` : "the person's who last changed it"
  return `This routine will now run on your behalf${me.name ? ` (${me.name})` : ''}, not ${them}.`
}

/** A run's time in its list: "Today 09:00", "Thu 6 Nov 09:00". */
export function runWhen(at: Date, now: Date): string {
  const today = at.toDateString() === now.toDateString()
  return today ? whenWords(at, now) : whenWords(at, now, { withDate: true })
}

const ASKS: Record<string, string> = { approval: 'needs your okay', limit: 'reached its time limit' }

/** What a run did, in its line: "Failed: the site wasn't answering", "Finished · started by you (Run now)". */
export function runDidWords(r: RoutineRunView, me: Me): { state: string; rest: string | null; tone: 'danger' | 'warning' | 'accent' | null } {
  const mark = runMark(r)
  const by = r.startedBy ? `started by ${r.startedBy.userId === me.id ? 'you' : r.startedBy.username ?? 'someone'} (Run now)` : null
  switch (mark) {
    case 'failed': return { state: 'Failed', rest: [r.reason, by].filter(Boolean).join(' · ') || null, tone: 'danger' }
    case 'asked': return { state: 'Needs you', rest: [ASKS[r.ask ?? ''] ?? null, by].filter(Boolean).join(' · ') || null, tone: 'warning' }
    case 'going': return { state: 'Running', rest: by, tone: 'accent' }
    case 'skipped': return { state: 'Skipped', rest: r.reason, tone: null }
    case 'stopped': return { state: 'Stopped', rest: [r.reason, by].filter(Boolean).join(' · ') || null, tone: null }
    case 'finished': return { state: 'Finished', rest: [r.reason, by].filter(Boolean).join(' · ') || null, tone: null }
  }
}

/** How long a run took; "—" for one that never ran, its time so far while it goes. */
export function tookWords(r: Pick<RoutineRunView, 'state' | 'startedAt' | 'endedAt'>, now: Date): string {
  if (r.state === 'SKIPPED') return '—'
  const end = r.endedAt ? new Date(r.endedAt) : isGoing(r) ? now : null
  return end ? spanWords(end.getTime() - new Date(r.startedAt).getTime()) : '—'
}

/** A change to a routine, as `updateRoutine` takes it. */
export type RoutinePatch = {
  title?: string
  agentId?: string | null
  instructions?: string
  cron?: string
  timezone?: string
  modelChoice?: string | null
  enabled?: boolean
}

export type Changeable = Pick<RoutineSummary, 'id' | 'title' | 'onBehalfOf' | 'enabled' | 'cron' | 'timezone'>

/** The dialog's second line: when it runs next once saved, or that it will not. */
export function nextRunLine(r: Changeable, patch: RoutinePatch, now: Date): string {
  const on = patch.enabled ?? r.enabled
  if (!on) return 'It will not run again until someone switches it on.'
  const tz = patch.timezone ?? r.timezone
  const next = nextCronTime(patch.cron ?? r.cron, tz, now)
  if (!next) return 'It has no time to run next.'
  const day = whenWords(next, now, { timeZone: tz, withDate: true }).replace(/ \d\d:\d\d$/, '')
  return `It runs next at ${hhmm(next, tz)} on ${day}.`
}

