import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, type ChangeRequest, type HostRequest } from '@agenthix/core'

/** What the person chose: now, or a set time (`at` is the browser's `datetime-local` value, in the person's time). */
export type WhenChoice = { mode: 'now' | 'later'; at: string }

export const NOW_CHOICE: WhenChoice = { mode: 'now', at: '' }

const pad = (n: number) => String(n).padStart(2, '0')
const localValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "At a set time", offered from the next whole hour a day on. */
export function later(now: Date): WhenChoice {
  const d = new Date(now.getTime() + 24 * 3600_000)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return { mode: 'later', at: localValue(d) }
}

const LEAD_MINUTES = SCHEDULED_CHANGE_PAUSE_LEAD_MS / 60_000

/** The instant to send (null for now), or the sentence beside the time field. */
export function parseWhen(choice: WhenChoice, now: Date): { ok: true; at: string | null } | { ok: false; error: string } {
  if (choice.mode === 'now') return { ok: true, at: null }
  const when = choice.at ? new Date(choice.at) : null
  if (!when || Number.isNaN(when.getTime())) return { ok: false, error: 'Choose the date and time.' }
  if (when.getTime() - now.getTime() < SCHEDULED_CHANGE_PAUSE_LEAD_MS) {
    return { ok: false, error: `Choose a time at least ${LEAD_MINUTES} minutes from now, so members get notice first.` }
  }
  return { ok: true, at: when.toISOString() }
}

/** The request for a change: run now as it is, or held by the host service until `at`. */
export const scheduleRequest = (change: ChangeRequest, at: string | null): HostRequest =>
  at === null ? change : { op: 'schedule', at, change }

const DAY_MS = 86400_000

/** A time in the button's few words: "Sat 02:00" within the week ahead, "Sat 25 Oct 02:00" beyond it. */
export function shortWhen(d: Date, now: Date): string {
  const day = d.toLocaleString('en-GB', { weekday: 'short' })
  const far = d.getTime() - now.getTime() >= 6 * DAY_MS || d.getTime() < now.getTime()
  const date = far ? ` ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}` : ''
  return `${day}${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The one button's words, the same for every kind of work: they follow *When*. */
export function doItLabel(when: WhenChoice, now: Date = new Date()): string {
  if (when.mode === 'now') return 'Do it now'
  const d = when.at ? new Date(when.at) : null
  return d && !Number.isNaN(d.getTime()) ? `Schedule for ${shortWhen(d, now)}` : 'Schedule'
}
