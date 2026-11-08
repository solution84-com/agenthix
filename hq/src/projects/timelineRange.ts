/** The pure parts of the timeline (adr-0098): its date range, what overlaps it and run slices. */
import { HttpError } from 'wasp/server'
import type { RunRow } from '@agenthix/core'

const DAY_MS = 24 * 60 * 60 * 1000
/** A year and a bit: the Quarter scale's widest view, with room either side. */
export const MAX_RANGE_DAYS = 400

export type Range = { from: Date; to: Date }

/** `from` inclusive, `to` exclusive; dates (`YYYY-MM-DD`) or times. */
export function timelineRange(from: string, to: string): Range {
  const f = new Date(from)
  const t = new Date(to)
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) throw new HttpError(400, 'from and to must be dates')
  if (t <= f) throw new HttpError(400, 'to must be after from')
  if (t.getTime() - f.getTime() > MAX_RANGE_DAYS * DAY_MS) throw new HttpError(400, `A timeline spans at most ${MAX_RANGE_DAYS} days`)
  return { from: f, to: t }
}

/** Room left either side of the dates a project knows. */
export const KNOWN_RANGE_PAD_DAYS = 14

const dayStart = (d: Date): number => d.getTime() - (((d.getTime() % DAY_MS) + DAY_MS) % DAY_MS)

/**
 * The range a timeline covers when none is asked for: from the earliest date known (plans, sprints, milestones,
 * start times, work) to the latest, today included, with room either side. A span longer than a range may be
 * is cut to a window around today, and says so.
 */
export function knownRange(dates: Array<Date | null | undefined>, today: Date): Range & { capped: boolean } {
  const times = [...dates.filter((d): d is Date => !!d && !Number.isNaN(d.getTime())), today].map(d => dayStart(d))
  const pad = KNOWN_RANGE_PAD_DAYS * DAY_MS
  const from = Math.min(...times) - pad
  const to = Math.max(...times) + DAY_MS + pad
  if (to - from > MAX_RANGE_DAYS * DAY_MS) {
    const mid = dayStart(today)
    const half = (MAX_RANGE_DAYS / 2) * DAY_MS
    return { from: new Date(mid - half), to: new Date(mid + half), capped: true }
  }
  return { from: new Date(from), to: new Date(to), capped: false }
}

/** Whether [start, finish] (whole days, finish inclusive) touches the range. Either end alone counts as a one-day plan. */
export function planOverlaps(start: Date | null, finish: Date | null, r: Range): boolean {
  const s = start ?? finish
  const f = finish ?? start
  if (!s || !f) return false
  return s < r.to && new Date(f.getTime() + DAY_MS) > r.from
}

export function inRange(at: Date | null | undefined, r: Range): boolean {
  return !!at && at >= r.from && at < r.to
}

export type RunSlice = { runId: string; taskId: string; status: RunRow['status']; start: string; end: string | null }

/**
 * The slices of work inside the range: each run of one of `taskIds`, from when
 * it started (or was made, if it never started) to when it ended — still open
 * while it runs.
 */
export function runSlices(runs: RunRow[], taskIds: Set<string>, r: Range, now: Date): RunSlice[] {
  return runs.flatMap(run => {
    if (!run.taskId || !taskIds.has(run.taskId)) return []
    const start = new Date(run.startedAt ?? run.createdAt)
    const end = run.endedAt ? new Date(run.endedAt) : run.status === 'RUNNING' || run.status === 'PENDING' ? now : start
    if (start >= r.to || end < r.from) return []
    return [{ runId: run.id, taskId: run.taskId, status: run.status, start: start.toISOString(), end: run.endedAt }]
  })
}

/** The `run.listPage` cursor that starts the page at the range's end: one read reaches back from there. */
export function pageCursorAt(to: Date): string {
  return `${to.toISOString()}|0`
}
