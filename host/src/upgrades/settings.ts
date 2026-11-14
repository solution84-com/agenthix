/**
 * What the host service keeps about upgrades, in `upgrades.json` in its state folder (spec §11): whether fixes
 * apply by themselves and in which maintenance window, whether the host service switches itself to a new version,
 * what the registry last said, the fixes it scheduled itself, the versions that rolled back (never tried again by
 * themselves), and the upgrade under way, so a restart of the host service partway through finishes it or puts it
 * back.
 */
import type { StateFolder } from '../state/folder'
import type { StoredHq, StoredSite } from '../service/context'
import { instantOf, wallIn } from './zoned'
import type { BuiltImages } from './builtUpgrade'

/**
 * A weekly window, or a daily one (`day` null), in the machine's time, or in `timeZone` (an IANA name) when Cloud set
 * it; `end` may pass midnight.
 */
export type MaintenanceWindow = { day: number | null; startMinute: number; endMinute: number; timeZone?: string }

/** Sunday 02:00–04:00, the CLI board's. */
export const DEFAULT_WINDOW: MaintenanceWindow = { day: 0, startMinute: 120, endMinute: 240 }

export type LastCheck = {
  at: string
  /** The versions published for every image of what runs here, oldest first; absent when the registry could not be read. */
  versions?: string[]
  /** The newest published host service. */
  host?: string | null
  problem?: string
}

/** An upgrade between its backup and its end: what was there, so it can be put back. */
export type UnderWay = {
  target: 'hq' | 'site'
  to: string
  from: string
  hq: StoredHq | null
  site: StoredSite
  backupId: string
  backupTakenAt: string
  /**
   * Why it is still under way, once a try to end it failed: the health check's problem and why putting it back failed
   * too, in words. Absent until then.
   */
  problem?: string
  /** A development build's upgrade to images built here (`builtUpgrade.ts`): their tag and ids; `to` is then `dev`. */
  built?: BuiltImages
}

/**
 * An upgrade that stopped HQ or the site and has not yet written `underWay`: written before anything stops, so a
 * restart while the backup is taken starts them again instead of leaving them stopped.
 */
export type Stopping = { target: 'hq' | 'site'; to: string; from: string; at: string; built?: string }

export type UpgradeSettings = {
  auto: boolean
  /** Whether the host service switches itself to a new version through the launcher (ADR-0118); on by default. */
  launcher: boolean
  window: MaintenanceWindow
  lastCheck: LastCheck | null
  /** Scheduled changes the window made, by id, so turning fixes off or moving the window moves them too. */
  automatic: string[]
  /** `<target>@<version>` that rolled back: offered on request, never applied by themselves again. */
  rolledBack: string[]
  underWay: UnderWay | null
  stopping: Stopping | null
  /** How the last upgrade ended, so `status` can say one was rolled back after the person who asked has gone. */
  last: LastUpgrade | null
}

export type LastUpgrade = { target: 'hq' | 'site'; to: string; endedAt: string; rolledBack: boolean; reason: string | null }

const FILE = 'upgrades.json'

export function readUpgrades(state: StateFolder): UpgradeSettings {
  const s = (state.readJson(FILE) ?? {}) as Partial<UpgradeSettings>
  return {
    auto: s.auto !== false,
    launcher: s.launcher !== false,
    window: s.window ?? DEFAULT_WINDOW,
    lastCheck: s.lastCheck ?? null,
    automatic: Array.isArray(s.automatic) ? s.automatic : [],
    rolledBack: Array.isArray(s.rolledBack) ? s.rolledBack : [],
    underWay: s.underWay ?? null,
    stopping: s.stopping ?? null,
    last: s.last ?? null,
  }
}

export function writeUpgrades(state: StateFolder, change: (s: UpgradeSettings) => void): UpgradeSettings {
  const s = readUpgrades(state)
  change(s)
  state.writeJson([FILE], s)
  return s
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const two = (n: number) => String(n).padStart(2, '0')
const clock = (minute: number) => `${two(Math.floor(minute / 60) % 24)}:${two(minute % 60)}`

/** `Sunday 02:00–04:00`, `every day 23:00–01:00`. */
export function windowText(w: MaintenanceWindow): string {
  return `${w.day === null ? 'every day' : DAYS[w.day]} ${clock(w.startMinute)}–${clock(w.endMinute)}${w.timeZone ? ` (${w.timeZone})` : ''}`
}

const CLOCK = /^(\d{1,2}):(\d{2})$/

function minuteOf(text: string): number | null {
  const m = CLOCK.exec(text)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Reads `--window`: `"Sun 02:00-04:00"`, `"Sunday 02:00–04:00"`, `"daily 23:00-01:00"`. */
export function parseWindow(input: string): MaintenanceWindow | { problem: string } {
  const bad = { problem: `Not a window this reads: "${input}". Write a day and two times, like "Sun 02:00-04:00", or "daily 02:00-04:00".` }
  const m = /^\s*(every day|daily|[A-Za-z]{3,9})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/i.exec(input)
  if (!m) return bad
  const name = m[1].toLowerCase()
  const day = name === 'daily' || name === 'every day' ? null : DAYS.findIndex(d => d.toLowerCase().startsWith(name))
  const start = minuteOf(m[2])
  const end = minuteOf(m[3])
  if (day === -1 || start === null || end === null) return bad
  if (start === end) return { problem: 'The window must last some time: its start and end are the same.' }
  return { day, startMinute: start, endMinute: end }
}

/**
 * The next start of the window at least `noticeMs` from now, so the people a fix affects are told ahead of it.
 * Days are stepped on the calendar, so a change of clocks does not move the window's hour.
 */
export function nextWindowStart(w: MaintenanceWindow, now: Date, noticeMs: number): Date {
  if (w.timeZone) return nextZonedStart(w, w.timeZone, now, noticeMs)
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, Math.floor(w.startMinute / 60), w.startMinute % 60)
    if ((w.day === null || d.getDay() === w.day) && d.getTime() - now.getTime() >= noticeMs) return d
  }
  throw new Error('No window start in the next two weeks.')
}

function nextZonedStart(w: MaintenanceWindow, zone: string, now: Date, noticeMs: number): Date {
  const today = wallIn(zone, now)
  for (let i = 0; i < 15; i++) {
    // Calendar days are stepped as plain dates, so the zone's change of clocks cannot skip or repeat one.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i))
    if (w.day !== null && day.getUTCDay() !== w.day) continue
    const start = instantOf(zone, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), w.startMinute)
    if (start.getTime() - now.getTime() >= noticeMs) return start
  }
  throw new Error('No window start in the next two weeks.')
}
