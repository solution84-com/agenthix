/**
 * A routine's schedule as a cron rule read in an IANA timezone (spec D22, adr-0177). Pure: hq stores the next due
 * time this gives, and every screen reads the same rule back.
 *
 * Five fields, minute (0–59), hour (0–23), day of the month (1–31), month (1–12 or JAN–DEC) and day of the week (0–7
 * or SUN–SAT, 0 and 7 both Sunday). Each field is `*`, a number, a range `a-b`, a step `*\/n`, `a-b/n` or `a/n`, or a
 * list of those. Day of the week also takes `d#n`, the nth such day of the month (1–5), and `dL`, the last. When both
 * day fields are restricted, a day matching either fires, as in every cron.
 *
 * Clock changes, read on the wall clock in the rule's timezone:
 *   - a time the clock skips (spring forward) fires as a clock that skipped it reads, that much later: 02:30 on a
 *     night that jumps from 02:00 to 03:00 fires at 03:30. Where that lands on another of the rule's times they fire
 *     once;
 *   - a time the clock passes twice (fall back) fires once, the first time — unless the hour field is `*`, when it
 *     fires both times, so "every 15 minutes" keeps going through the repeated hour;
 *   - where either would bring a firing closer than 5 minutes to the one before it (a clock that moves by half an
 *     hour can), that firing is skipped, so the floor holds in real time too.
 */
import { CRON_MAX_LENGTH, ROUTINE_MIN_INTERVAL_MINUTES } from './routineModel.js'

export type CronWeekdays = {
  /** Every such day: 0 (Sunday) to 6. */
  days: number[]
  /** The nth such day of the month, n from 1 to 5. */
  nth: Array<{ day: number; n: number }>
  /** The last such day of the month. */
  last: number[]
}

export type CronRule = {
  minutes: number[]
  hours: number[]
  /** null when the field is `*`. */
  daysOfMonth: number[] | null
  months: number[]
  /** null when the field is `*`. */
  weekdays: CronWeekdays | null
  /** The hour field is `*`: a time the clock passes twice fires both times. */
  everyHour: boolean
}

export type CronParse = { ok: true; rule: CronRule } | { ok: false; problem: string }

type FieldSpec = { name: string; min: number; max: number; names?: readonly string[] }

const MINUTE: FieldSpec = { name: 'minute', min: 0, max: 59 }
const HOUR: FieldSpec = { name: 'hour', min: 0, max: 23 }
const DAY_OF_MONTH: FieldSpec = { name: 'day of the month', min: 1, max: 31 }
const MONTH: FieldSpec = {
  name: 'month', min: 1, max: 12,
  names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
}
const WEEKDAY: FieldSpec = { name: 'day of the week', min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] }

class FieldError extends Error {}

function valueOf(text: string, f: FieldSpec): number {
  const named = f.names?.indexOf(text.toUpperCase()) ?? -1
  if (named >= 0) return named + (f.name === 'month' ? 1 : 0)
  if (!/^\d{1,2}$/.test(text)) throw new FieldError(`"${text}" is not a ${f.name}`)
  const n = Number(text)
  if (n < f.min || n > f.max) throw new FieldError(`${f.name} ${n} is out of range: ${f.min} to ${f.max}`)
  return n
}

/** One field's values, sorted and distinct, and whether it was `*`. */
function parseField(text: string, f: FieldSpec): { values: number[]; star: boolean } {
  const values = new Set<number>()
  for (const item of text.split(',')) {
    if (item === '') throw new FieldError(`an empty item in the ${f.name} field`)
    const [range, stepText, extra] = item.split('/')
    if (extra !== undefined) throw new FieldError(`"${item}" has more than one step`)
    const step = stepText === undefined ? 1 : Number(stepText)
    if (stepText !== undefined && (!/^\d{1,2}$/.test(stepText) || step < 1)) throw new FieldError(`"${item}" has a step that is not a whole number above 0`)
    let lo: number
    let hi: number
    if (range === '*') {
      lo = f.min
      hi = f.max === 7 ? 6 : f.max
    } else if (range.includes('-')) {
      const [a, b, more] = range.split('-')
      if (more !== undefined) throw new FieldError(`"${item}" is not a range`)
      lo = valueOf(a, f)
      hi = valueOf(b, f)
      if (lo > hi) throw new FieldError(`"${item}" runs backwards`)
    } else {
      lo = valueOf(range, f)
      hi = stepText === undefined ? lo : f.max === 7 ? 6 : f.max
    }
    for (let v = lo; v <= hi; v += step) values.add(f.max === 7 && v === 7 ? 0 : v)
  }
  return { values: [...values].sort((a, b) => a - b), star: text === '*' }
}

function parseWeekdays(text: string): CronWeekdays | null {
  if (text === '*') return null
  const out: CronWeekdays = { days: [], nth: [], last: [] }
  const plain: string[] = []
  for (const item of text.split(',')) {
    const nth = /^(\w+)#(\d)$/.exec(item)
    const last = /^(\w+)L$/i.exec(item)
    if (nth) {
      const n = Number(nth[2])
      if (n < 1 || n > 5) throw new FieldError(`"${item}": a month has at most five of any weekday`)
      out.nth.push({ day: valueOf(nth[1], WEEKDAY) % 7, n })
    } else if (last) {
      out.last.push(valueOf(last[1], WEEKDAY) % 7)
    } else {
      plain.push(item)
    }
  }
  if (plain.length > 0) out.days = parseField(plain.join(','), WEEKDAY).values
  return out
}

/** Reads a cron rule, or says what is wrong with it. Never more often than the floor, and it must come at all. */
export function parseCron(text: string): CronParse {
  if (typeof text !== 'string') return { ok: false, problem: 'A schedule must be a cron expression' }
  if (text.length > CRON_MAX_LENGTH) return { ok: false, problem: `A cron expression is at most ${CRON_MAX_LENGTH} characters` }
  const fields = text.trim().split(/\s+/)
  if (fields.length !== 5 || fields[0] === '') {
    return { ok: false, problem: 'A cron expression has five fields: minute, hour, day of the month, month and day of the week' }
  }
  try {
    const minutes = parseField(fields[0], MINUTE).values
    const hour = parseField(fields[1], HOUR)
    const dom = parseField(fields[2], DAY_OF_MONTH)
    const rule: CronRule = {
      minutes,
      hours: hour.values,
      daysOfMonth: dom.star ? null : dom.values,
      months: parseField(fields[3], MONTH).values,
      weekdays: parseWeekdays(fields[4]),
      everyHour: hour.star,
    }
    const problem = ruleProblem(rule)
    return problem ? { ok: false, problem } : { ok: true, rule }
  } catch (err) {
    if (err instanceof FieldError) return { ok: false, problem: `${err.message.charAt(0).toUpperCase()}${err.message.slice(1)}` }
    throw err
  }
}

// ── Days ────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Whether the rule fires on this calendar day (y, m 1–12, d). */
export function cronFiresOnDay(rule: CronRule, year: number, month: number, day: number): boolean {
  if (!rule.months.includes(month)) return false
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const byDate = rule.daysOfMonth?.includes(day) ?? false
  const w = rule.weekdays
  const byWeekday = !!w && (
    w.days.includes(weekday) ||
    w.nth.some(x => x.day === weekday && Math.ceil(day / 7) === x.n) ||
    w.last.some(x => x === weekday && day + 7 > daysInMonth(year, month))
  )
  if (rule.daysOfMonth && w) return byDate || byWeekday
  if (rule.daysOfMonth) return byDate
  if (w) return byWeekday
  return true
}

/** Every leap-year and weekday pattern comes round within this many days, so a rule that fires at all fires in it. */
const PATTERN_DAYS = 8 * 366 + 7
const PATTERN_START = Date.UTC(2001, 0, 1)

function* patternDays(): Generator<[number, number, number]> {
  for (let i = 0; i < PATTERN_DAYS; i++) {
    const d = new Date(PATTERN_START + i * DAY_MS)
    yield [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
  }
}

/** The fewest minutes between two firings, on the wall clock; Infinity for a rule that fires once a day at most. */
export function cronShortestGapMinutes(rule: CronRule): number {
  const times = rule.hours.flatMap(h => rule.minutes.map(m => h * 60 + m))
  let gap = Infinity
  for (let i = 1; i < times.length; i++) gap = Math.min(gap, times[i] - times[i - 1])
  const overnight = 1440 - times[times.length - 1] + times[0]
  if (overnight < gap && firesOnTwoDaysRunning(rule)) gap = overnight
  return gap
}

function firesOnTwoDaysRunning(rule: CronRule): boolean {
  let yesterday = false
  for (const [y, m, d] of patternDays()) {
    const today = cronFiresOnDay(rule, y, m, d)
    if (today && yesterday) return true
    yesterday = today
  }
  return false
}

function ruleProblem(rule: CronRule): string | null {
  let fires = false
  for (const [y, m, d] of patternDays()) {
    if (cronFiresOnDay(rule, y, m, d)) {
      fires = true
      break
    }
  }
  if (!fires) return 'This never comes: no day matches it (for example, 30 February)'
  const gap = cronShortestGapMinutes(rule)
  if (gap >= ROUTINE_MIN_INTERVAL_MINUTES) return null
  const unit = gap === 1 ? 'minute' : 'minutes'
  const evenly = rule.minutes.every((m, i) => m === i * gap) && rule.minutes.length * gap === 60
  return evenly
    ? `Every ${gap} ${unit} is too often: a routine runs at most every ${ROUTINE_MIN_INTERVAL_MINUTES} minutes`
    : `Two of its times are ${gap} ${unit} apart, which is too often: a routine runs at most every ${ROUTINE_MIN_INTERVAL_MINUTES} minutes`
}

// ── Times in a timezone ─────────────────────────────────────────────────────

const formats = new Map<string, Intl.DateTimeFormat>()

function formatIn(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    })
    formats.set(tz, f)
  }
  return f
}

export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    formatIn(tz)
    return true
  } catch {
    return false
  }
}

/** The wall-clock time an instant reads in `tz`, as if it were UTC, to the minute. */
function wallOf(instant: number, tz: string): number {
  const parts = formatIn(tz).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
}

function offsetAt(instant: number, tz: string): number {
  const minute = Math.floor(instant / 60_000) * 60_000
  return wallOf(minute, tz) - minute
}

/** The instants a wall-clock time names: one, two when the clock passes it twice, or the skipped time moved on. */
function instantsOf(wall: number, tz: string, everyHour: boolean): number[] {
  const offsets = new Set([offsetAt(wall - DAY_MS, tz), offsetAt(wall, tz), offsetAt(wall + DAY_MS, tz)])
  const valid = [...offsets].map(o => wall - o).filter(i => wallOf(i, tz) === wall).sort((a, b) => a - b)
  if (valid.length === 0) return [wall - offsetAt(wall - DAY_MS, tz)]
  return everyHour ? [...new Set(valid)] : [valid[0]]
}

/** The rule's next `count` times strictly after `after`, read in `tz`. */
export function nextCronTimes(rule: CronRule, tz: string, after: Date, count: number): Date[] {
  const afterMs = after.getTime()
  const startDay = new Date(wallOf(afterMs, tz) - DAY_MS)
  const found: number[] = []
  let ahead = 0
  let extraDays = -1
  for (let i = 0; i < PATTERN_DAYS && extraDays !== 0; i++) {
    const d = new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate() + i))
    const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
    if (cronFiresOnDay(rule, y, m, day)) {
      for (const h of rule.hours) {
        for (const min of rule.minutes) {
          for (const at of instantsOf(Date.UTC(y, m - 1, day, h, min), tz, rule.everyHour)) {
            found.push(at)
            if (at > afterMs) ahead++
          }
        }
      }
    }
    // One more day once enough are found, for a time moved on past midnight by a clock change.
    if (extraDays > 0) extraDays--
    else if (extraDays < 0 && ahead >= count) extraDays = 1
  }
  return keepFloor([...new Set(found)].sort((a, b) => a - b)).filter(t => t > afterMs).slice(0, count).map(t => new Date(t))
}

/** Drops a firing a clock change brought closer than the floor to the one before it. */
function keepFloor(sorted: number[]): number[] {
  const kept: number[] = []
  for (const t of sorted) {
    if (kept.length === 0 || t - kept[kept.length - 1] >= ROUTINE_MIN_INTERVAL_MINUTES * 60_000) kept.push(t)
  }
  return kept
}

/** When a routine with this rule next fires after `after`; null when the rule cannot be read. */
export function nextCronTime(cron: string, tz: string, after: Date): Date | null {
  const parsed = parseCron(cron)
  if (!parsed.ok || !isTimezone(tz)) return null
  return nextCronTimes(parsed.rule, tz, after, 1)[0] ?? null
}

/** Why a schedule cannot be saved, or null when it can. */
export function routineScheduleProblem(cron: string, tz: string): string | null {
  if (!isTimezone(tz)) return `"${String(tz)}" is not a timezone`
  const parsed = parseCron(cron)
  return parsed.ok ? null : parsed.problem
}
