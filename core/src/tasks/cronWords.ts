/**
 * A routine's schedule in words (spec D22): the presets people build it from, the cron rule each one writes, the
 * preset a cron rule says when it says one, and the plain-words read-back. Pure, so every screen reads a schedule the
 * same way.
 */
import { parseCron, type CronRule } from './cron.js'
import { ROUTINE_MIN_INTERVAL_MINUTES } from './routineModel.js'

/** Times are HH:MM on the 24-hour clock. A preset with several times keeps one minute for them all, as cron does. */
export type SchedulePreset =
  | { kind: 'everyMinutes'; every: number }
  | { kind: 'everyHours'; every: number; minute: number }
  | { kind: 'daily'; times: string[] }
  | { kind: 'weekdays'; times: string[] }
  /** Days are 0 (Sunday) to 6. */
  | { kind: 'weekly'; days: number[]; times: string[] }
  | { kind: 'monthlyDay'; day: number; times: string[] }
  | { kind: 'monthlyWeekday'; which: 'first' | 'last'; weekday: number; times: string[] }

/** "Every N minutes" can be said in cron only for a step that divides the hour. */
export const MINUTE_STEPS = [5, 6, 10, 12, 15, 20, 30] as const
/** "Every N hours" likewise divides the day. */
export const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12] as const

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function timesOf(p: SchedulePreset): string[] {
  return 'times' in p ? p.times : []
}

/** Why a preset cannot be saved, said on its own control; null when it can. */
export function presetProblem(p: SchedulePreset): string | null {
  if (p.kind === 'everyMinutes') {
    if (!Number.isInteger(p.every) || p.every < ROUTINE_MIN_INTERVAL_MINUTES) {
      return `${p.every} is too often: a routine runs at most every ${ROUTINE_MIN_INTERVAL_MINUTES} minutes`
    }
    if (!(MINUTE_STEPS as readonly number[]).includes(p.every)) return `Every ${p.every} minutes does not divide the hour: choose ${MINUTE_STEPS.join(', ')}`
    return null
  }
  if (p.kind === 'everyHours') {
    if (!(HOUR_STEPS as readonly number[]).includes(p.every)) return `Every ${p.every} hours does not divide the day: choose ${HOUR_STEPS.join(', ')}`
    if (!Number.isInteger(p.minute) || p.minute < 0 || p.minute > 59) return 'The minute past the hour is 0 to 59'
    return null
  }
  const times = timesOf(p)
  if (times.length === 0) return 'Give at least one time'
  if (times.some(t => !TIME.test(t))) return 'A time is HH:MM on the 24-hour clock'
  if (new Set(times.map(t => t.slice(3))).size > 1) {
    return 'Times on one schedule share their minutes: for example 09:00 and 15:00, not 09:00 and 15:30'
  }
  if (p.kind === 'weekly' && (p.days.length === 0 || p.days.some(d => !Number.isInteger(d) || d < 0 || d > 6))) {
    return 'Choose at least one day of the week'
  }
  if (p.kind === 'monthlyDay' && (!Number.isInteger(p.day) || p.day < 1 || p.day > 31)) return 'A day of the month is 1 to 31'
  if (p.kind === 'monthlyWeekday' && (!Number.isInteger(p.weekday) || p.weekday < 0 || p.weekday > 6)) return 'Choose a day of the week'
  return null
}

function timeFields(times: string[]): string {
  const hours = [...new Set(times.map(t => Number(t.slice(0, 2))))].sort((a, b) => a - b)
  return `${Number(times[0].slice(3))} ${hours.join(',')}`
}

/** The cron rule a preset writes; null when the preset has a problem. */
export function cronOfPreset(p: SchedulePreset): string | null {
  if (presetProblem(p)) return null
  switch (p.kind) {
    case 'everyMinutes': return `*/${p.every} * * * *`
    case 'everyHours': return `${p.minute} ${p.every === 1 ? '*' : `*/${p.every}`} * * *`
    case 'daily': return `${timeFields(p.times)} * * *`
    case 'weekdays': return `${timeFields(p.times)} * * 1-5`
    case 'weekly': return `${timeFields(p.times)} * * ${[...new Set(p.days)].sort((a, b) => a - b).join(',')}`
    case 'monthlyDay': return `${timeFields(p.times)} ${p.day} * *`
    case 'monthlyWeekday': return `${timeFields(p.times)} * * ${p.weekday}${p.which === 'first' ? '#1' : 'L'}`
  }
}

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])
const pad = (n: number) => String(n).padStart(2, '0')

function evenStep(values: number[], size: number): number | null {
  const step = values[1] !== undefined ? values[1] - values[0] : size
  return values[0] === 0 && same(values, range(0, Math.ceil(size / step) - 1).map(i => i * step)) && size % step === 0 ? step : null
}

/** The preset a rule says, so the builder selects it; null when only Advanced can say it. */
export function presetOfRule(rule: CronRule): SchedulePreset | null {
  if (!same(rule.months, range(1, 12))) return null
  const anyDay = rule.daysOfMonth === null && rule.weekdays === null
  const allHours = same(rule.hours, range(0, 23))
  if (anyDay && allHours) {
    const every = evenStep(rule.minutes, 60)
    if (every !== null && (MINUTE_STEPS as readonly number[]).includes(every)) return { kind: 'everyMinutes', every }
  }
  if (rule.minutes.length !== 1) return null
  const minute = rule.minutes[0]
  if (anyDay) {
    const step = allHours ? 1 : evenStep(rule.hours, 24)
    if (step !== null && (HOUR_STEPS as readonly number[]).includes(step)) return { kind: 'everyHours', every: step, minute }
  }
  const times = rule.hours.map(h => `${pad(h)}:${pad(minute)}`)
  if (anyDay) return { kind: 'daily', times }
  const w = rule.weekdays
  if (rule.daysOfMonth === null && w && w.nth.length === 0 && w.last.length === 0) {
    return same(w.days, [1, 2, 3, 4, 5]) ? { kind: 'weekdays', times } : { kind: 'weekly', days: w.days, times }
  }
  if (rule.daysOfMonth?.length === 1 && w === null) return { kind: 'monthlyDay', day: rule.daysOfMonth[0], times }
  if (rule.daysOfMonth === null && w && w.days.length === 0) {
    if (w.nth.length === 1 && w.last.length === 0 && w.nth[0].n === 1) return { kind: 'monthlyWeekday', which: 'first', weekday: w.nth[0].day, times }
    if (w.last.length === 1 && w.nth.length === 0) return { kind: 'monthlyWeekday', which: 'last', weekday: w.last[0], times }
  }
  return null
}

export function presetOfCron(cron: string): SchedulePreset | null {
  const parsed = parseCron(cron)
  return parsed.ok ? presetOfRule(parsed.rule) : null
}

/** "a, b and c". */
function listed(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

function dayList(days: number[]): string {
  if (same(days, [1, 2, 3, 4, 5])) return 'Monday to Friday'
  if (same(days, [0, 6])) return 'Saturday and Sunday'
  return listed(days.map(d => DAY_NAMES[d]))
}

/** The schedule's place in words: "Sydney time", "UTC". */
export function zoneWords(tz: string): string {
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC'
  const city = tz.split('/').pop()?.replace(/_/g, ' ')
  return city && city !== tz ? `${city} time` : tz
}

function presetWords(p: SchedulePreset): string {
  const at = `At ${listed(timesOf(p))}`
  switch (p.kind) {
    case 'everyMinutes': return `Every ${p.every} minutes`
    case 'everyHours': {
      const when = p.minute === 0 ? 'on the hour' : `at ${p.minute} ${p.minute === 1 ? 'minute' : 'minutes'} past`
      return p.every === 1 ? `Every hour, ${when}` : `Every ${p.every} hours, ${when}`
    }
    case 'daily': return `${at} every day`
    case 'weekdays': return `${at}, Monday to Friday`
    case 'weekly': return `${at} on ${dayList(p.days)}`
    case 'monthlyDay': return `${at} on the ${ordinal(p.day)} of every month${p.day > 28 ? ', in the months that have one' : ''}`
    case 'monthlyWeekday': return `${at} on the ${p.which} ${DAY_NAMES[p.weekday]} of the month`
  }
}

function ruleWords(rule: CronRule): string {
  const times = rule.hours.length * rule.minutes.length <= 6
    ? `At ${listed(rule.hours.flatMap(h => rule.minutes.map(m => `${pad(h)}:${pad(m)}`)))}`
    : `At ${rule.minutes.length === 60 ? 'every minute' : `minutes ${listed(rule.minutes.map(String))}`} past ${
      rule.everyHour ? 'every hour' : `hours ${listed(rule.hours.map(String))}`}`
  const days: string[] = []
  if (rule.daysOfMonth) days.push(`on day ${listed(rule.daysOfMonth.map(String))} of the month`)
  const w = rule.weekdays
  if (w) {
    const parts = [
      ...(w.days.length ? [dayList(w.days)] : []),
      ...w.nth.map(x => `the ${ordinal(x.n)} ${DAY_NAMES[x.day]}`),
      ...w.last.map(d => `the last ${DAY_NAMES[d]}`),
    ]
    days.push(`on ${listed(parts)}`)
  }
  const months = same(rule.months, range(1, 12)) ? '' : ` in ${listed(rule.months.map(m => MONTH_NAMES[m - 1]))}`
  return `${times}${days.length ? ` ${days.join(' or ')}` : ''}${months}`
}

/** The schedule read back in plain words with its timezone: "At 09:00, Monday to Friday, Sydney time". */
export function describeSchedule(cron: string, tz: string): string | null {
  const parsed = parseCron(cron)
  if (!parsed.ok) return null
  const preset = presetOfRule(parsed.rule)
  return `${preset ? presetWords(preset) : ruleWords(parsed.rule)}, ${zoneWords(tz)}`
}
