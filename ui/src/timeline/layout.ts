/**
 * The timeline's dates and geometry, pure. Everything is in UTC days (a plan is a
 * date, not a moment); a position is a fraction of the visible range, so the same
 * arithmetic serves a column a day, a week or a month.
 */
import type { Instant, PlanChange, TimelineScale } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000

export interface TimelineColumn { label: string; start: number; end: number; weekend: boolean }
export interface TimelineGroup { label: string; start: number; end: number }
export interface TimelineView {
  scale: TimelineScale
  from: number
  to: number
  columns: TimelineColumn[]
  groups: TimelineGroup[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const ms = (at: Instant): number => (at instanceof Date ? at : new Date(at)).getTime()

/** Midnight UTC of the day an instant falls on. */
export const dayOf = (at: Instant | number): number => {
  const t = typeof at === 'number' ? at : ms(at)
  return t - (((t % DAY_MS) + DAY_MS) % DAY_MS)
}

/** Today as a UTC day, taken from the viewer's own calendar date. */
export const todayUtc = (now: Date): number => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

const ymd = (day: number): string => new Date(day).toISOString().slice(0, 10)
export const isoDay = ymd

const monthStart = (day: number, plusMonths = 0): number => {
  const d = new Date(day)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + plusMonths, 1)
}
export const mondayOf = (day: number): number => {
  const weekday = (new Date(day).getUTCDay() + 6) % 7
  return day - weekday * DAY_MS
}

function columns(from: number, to: number, step: 'day' | 'week' | 'month'): TimelineColumn[] {
  const out: TimelineColumn[] = []
  let at = from
  while (at < to) {
    const d = new Date(at)
    let next: number
    let label: string
    if (step === 'day') {
      next = at + DAY_MS
      label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
    } else if (step === 'week') {
      next = at + 7 * DAY_MS
      label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    } else {
      next = monthStart(at, 1)
      label = MONTHS[d.getUTCMonth()]!
    }
    out.push({ label, start: at, end: next, weekend: step === 'day' && (d.getUTCDay() === 0 || d.getUTCDay() === 6) })
    at = next
  }
  return out
}

function groups(from: number, to: number, by: 'month' | 'year'): TimelineGroup[] {
  const out: TimelineGroup[] = []
  let at = from
  while (at < to) {
    const d = new Date(at)
    const end = by === 'month' ? monthStart(at, 1) : Date.UTC(d.getUTCFullYear() + 1, 0, 1)
    out.push({
      label: by === 'month' ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(d.getUTCFullYear()),
      start: at,
      end: Math.min(end, to),
    })
    at = end
  }
  return out
}

/** How wide a day is on each scale: the chart is as wide as the dates it covers and scrolls sideways within them. */
export const PX_PER_DAY: Record<TimelineScale, number> = { week: 44, month: 10, quarter: 3 }
/** What ‹ and › move by: a week, a month, a quarter. */
export const STEP_DAYS: Record<TimelineScale, number> = { week: 7, month: 30, quarter: 91 }
/** The sticky label column's width, in pixels (`w-44`). */
export const LABEL_PX = 176

/**
 * The columns and headings for a scale across `from`..`to` (spec §3). Week: a column a day. Month: a column a
 * week, from a Monday. Quarter: a column a month. The ends are moved out to whole columns.
 */
export function viewOver(scale: TimelineScale, from: number, to: number): TimelineView {
  if (scale === 'week') {
    const f = dayOf(from)
    const t = Math.max(dayOf(to), f + DAY_MS)
    return { scale, from: f, to: t, columns: columns(f, t, 'day'), groups: groups(f, t, 'month') }
  }
  if (scale === 'month') {
    const f = mondayOf(dayOf(from))
    const weeks = Math.max(1, Math.ceil((to - f) / (7 * DAY_MS)))
    const t = f + weeks * 7 * DAY_MS
    return { scale, from: f, to: t, columns: columns(f, t, 'week'), groups: groups(f, t, 'month') }
  }
  const f = monthStart(from)
  const t = monthStart(to - 1, 1)
  return { scale, from: f, to: t, columns: columns(f, t, 'month'), groups: groups(f, t, 'year') }
}

/**
 * The range the chart scrolls across: everything the timeline read covers, and at least a screen either side of
 * today, so that there is always somewhere to scroll and today can sit near the left.
 */
export function chartView(scale: TimelineScale, known: { from: Instant | number; to: Instant | number } | null, today: number, viewportPx: number): TimelineView {
  const viewportDays = Math.ceil(Math.max(viewportPx - LABEL_PX, 320) / PX_PER_DAY[scale])
  const from = Math.min(known ? (typeof known.from === 'number' ? known.from : ms(known.from)) : today, today - Math.ceil(viewportDays * 0.3) * DAY_MS)
  const to = Math.max(known ? (typeof known.to === 'number' ? known.to : ms(known.to)) : today, today + viewportDays * DAY_MS)
  return viewOver(scale, from, to)
}

/** The chart's width in pixels, label column excluded. */
export const trackPx = (view: TimelineView): number => Math.round(((view.to - view.from) / DAY_MS) * PX_PER_DAY[view.scale])

/** The scroll position that puts `day` a quarter of the way along the visible track. */
export function scrollToDay(view: TimelineView, day: number, viewportPx: number): number {
  const x = ((day - view.from) / DAY_MS) * PX_PER_DAY[view.scale]
  return Math.max(0, Math.round(x - 0.25 * Math.max(viewportPx - LABEL_PX, 0)))
}

/** The day at the left edge of the visible track for a scroll position. */
export function dayAtScroll(view: TimelineView, scrollLeft: number): number {
  return dayOf(view.from + (scrollLeft / PX_PER_DAY[view.scale]) * DAY_MS)
}

/** Where an instant falls in the view, as a percentage; outside 0..100 when it is out of range. */
export const percentAt = (view: TimelineView, at: number): number => ((at - view.from) / (view.to - view.from)) * 100

export interface BarBox { left: number; width: number; clippedStart: boolean; clippedEnd: boolean }

function clip(view: TimelineView, start: number, end: number, minWidth: number): BarBox | null {
  if (end <= view.from || start >= view.to) return null
  const s = Math.max(start, view.from)
  const e = Math.min(end, view.to)
  const left = percentAt(view, s)
  return {
    left,
    width: Math.max(percentAt(view, e) - left, minWidth),
    clippedStart: start < view.from,
    clippedEnd: end > view.to,
  }
}

/** A plan's bar, from its first day to the end of its last; either date alone is a one-day plan. Null when out of range or undated. */
export function planBox(view: TimelineView, planStart: Instant | null, planFinish: Instant | null): BarBox | null {
  const start = planStart ?? planFinish
  const finish = planFinish ?? planStart
  if (!start || !finish) return null
  return clip(view, dayOf(start), dayOf(finish) + DAY_MS, 0.4)
}

/** A run's slice; one still running reaches `now`. */
export function sliceBox(view: TimelineView, start: string, end: string | null, now: number): BarBox | null {
  const s = ms(start)
  const e = end ? ms(end) : now
  return clip(view, s, Math.max(e, s), 0.25)
}

/** A day's whole-column box, for sprints and the like. */
export function spanBox(view: TimelineView, start: Instant, finish: Instant): BarBox | null {
  return clip(view, dayOf(start), dayOf(finish) + DAY_MS, 0.4)
}

export type DragMode = 'move' | 'start' | 'finish'

/** The plan after dragging by whole days; an end never passes the other (a plan is at least a day). */
export function dragPlan(
  plan: { planStart: Instant | null; planFinish: Instant | null }, mode: DragMode, deltaDays: number,
): PlanChange | null {
  const start = plan.planStart ?? plan.planFinish
  const finish = plan.planFinish ?? plan.planStart
  if (!start || !finish) return null
  let s = dayOf(start)
  let f = dayOf(finish)
  if (mode === 'move') { s += deltaDays * DAY_MS; f += deltaDays * DAY_MS }
  else if (mode === 'start') s = Math.min(s + deltaDays * DAY_MS, f)
  else f = Math.max(f + deltaDays * DAY_MS, s)
  return { planStart: ymd(s), planFinish: ymd(f) }
}

/** Whole days a pointer moved across a track `widthPx` wide showing `view`. */
export function daysMoved(view: TimelineView, dxPx: number, widthPx: number): number {
  if (widthPx <= 0) return 0
  return Math.round((dxPx / widthPx) * ((view.to - view.from) / DAY_MS))
}

/** A start time moved by whole days, keeping its time of day. */
export const moveStartTime = (at: Instant, deltaDays: number): Date => new Date(ms(at) + deltaDays * DAY_MS)

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
export const formatDay = (at: Instant | number): string => dayFormat.format(typeof at === 'number' ? at : ms(at))
/** A day of an instant in the viewer's own time zone, the one `formatTime` uses (a plan's days are UTC dates, `formatDay`). */
const localDayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export const formatLocalDay = (at: Instant): string => localDayFormat.format(new Date(ms(at)))
export const formatTime = (at: Instant): string => timeFormat.format(new Date(ms(at)))
