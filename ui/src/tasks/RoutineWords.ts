/**
 * A routine in words (every screen reviewed spec §3): the sentence that says
 * what happens, its rounds' states and times, and how long a run took. Pure, so
 * the routine, its lists and their tests read the same words.
 */
import type { ScheduleRuleInput } from './RoutineRuleFields'

/** What became of a round: its square's colour and its line's words. */
export type RoutineRoundState = 'done' | 'failed' | 'needsYou' | 'running' | 'waiting'

export const ROUND_STATE_WORDS: Record<RoutineRoundState, string> = {
  done: 'Done', failed: 'Failed', needsYou: 'Needs you', running: 'Running', waiting: 'Waiting',
}

const SUMMARY_ORDER: RoutineRoundState[] = ['done', 'failed', 'needsYou', 'running', 'waiting']

/** "Last 10: 6 done · 2 failed · 1 needs you · 1 waiting". */
export function roundsSummary(states: RoutineRoundState[]): string {
  if (states.length === 0) return 'No rounds yet'
  const parts = SUMMARY_ORDER
    .map(s => [s, states.filter(x => x === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${ROUND_STATE_WORDS[s].toLowerCase()}`)
  return `Last ${states.length}: ${parts.join(' · ')}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "09:00" → "9:00". */
function clock(time: string): string {
  return time.replace(/^0(\d)/, '$1')
}

/** The wall-clock time of `iso` in `timezone`, as "9:00". */
function timeIn(iso: string, timezone: string): string {
  try {
    return clock(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)))
  } catch {
    return ''
  }
}

function listed(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * When it repeats, as the start of a sentence: "Every weekday at 9:00", "Every
 * Monday at 10:00", "Every 2 hours", "Every day at 9:00" (a daily repeat's time
 * is its anchor's, read in its timezone).
 */
export function ruleSentence(rule: ScheduleRuleInput | null, anchor?: { at: string; timezone: string }): string {
  if (!rule) return 'On a schedule that can no longer be read'
  if (rule.kind === 'interval') {
    const unit = rule.unit.replace(/s$/, '')
    const every = rule.every === 1 ? `Every ${unit}` : `Every ${rule.every} ${rule.unit}`
    const at = rule.unit === 'days' && anchor ? timeIn(anchor.at, anchor.timezone) : ''
    return at ? `${every} at ${at}` : every
  }
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b)
  const at = clock(rule.time)
  if (days.length === 7) return `Every day at ${at}`
  if (days.join() === '1,2,3,4,5') return `Every weekday at ${at}`
  if (days.join() === '0,6') return `Every Saturday and Sunday at ${at}`
  if (days.length === 1) return `Every ${DAY_NAMES[days[0]]} at ${at}`
  return `Every ${listed(days.map(d => DAY_SHORT[d]))} at ${at}`
}

/** "Australia/Sydney" → "Sydney time"; "UTC" stays. */
export function zoneLabel(timezone: string): string {
  if (!timezone.includes('/')) return timezone
  return `${timezone.split('/').pop()!.replace(/_/g, ' ')} time`
}

/** A round's time near now: "Today 9:00", "Tomorrow 9:00", "Yesterday 9:00", "Thu 9:00", or "3 Oct 9:00". */
export function roundWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—'
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days === -1) return `Yesterday ${time}`
  if (Math.abs(days) < 7) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}

/** "42 s", "6 min", "1 h 5 min"; "—" when unknown. */
export function tookText(ms: number | null): string {
  if (ms === null) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}
