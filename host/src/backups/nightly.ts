/**
 * The nightly backup (spec §12): every machine backs up on its own at the fleet's backup time, 02:00 unless it is
 * set otherwise, in the machine's local time. Checked every minute. A night missed while the host service was not
 * running — the machine off or asleep, the container recreated — is caught up once, as soon as it runs again; a
 * missed night is never followed by a second backup straight after, so one due within `NEXT_SOON_MS` waits for its
 * own time instead. Each night is tried once, and a failure waits for the next.
 *
 * One backup, restore, move or erase runs at a time (`exclusive`). A night that finds the machine held — a scheduled
 * move at the backup's time, say — is not tried yet: it backs up as soon as the machine is free, and only if it is
 * still held when the night is lost (the next one within `NEXT_SOON_MS`) is it skipped, with why, in the log.
 */
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { BackupStore } from './store'
import { anySuspended } from '../lifecycle/suspend'
import { exclusive, holding, nightOf, takeBackup } from './take'
import { isDemoInstallation } from '../state/installation'

/** A missed night is not caught up when the next one is due within this: that one backs up at its own time. */
const NEXT_SOON_MS = 6 * 3600_000

type BackupTime = { hour: number; minute: number }

/** The night that found the machine held, by state folder: what held it, from when. */
const held = new Map<string, { night: string; holder: string; since: Date }>()

function onDay(base: Date, days: number, time: BackupTime): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(time.hour, time.minute, 0, 0)
  return d
}

/** The time today at which tonight's backup is due. */
export function dueAt(now: Date, time: BackupTime): Date {
  return onDay(now, 0, time)
}

/** The latest backup time that has come: today's once it has passed, yesterday's before. */
export function lastDue(now: Date, time: BackupTime): Date {
  const today = dueAt(now, time)
  return now >= today ? today : onDay(now, -1, time)
}

const two = (n: number) => String(n).padStart(2, '0')
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`

/** Takes the last night's backup when it has not been tried yet. Resolves to whether it took one. */
export async function nightlyTick(ctx: Context): Promise<boolean> {
  const site = installed(ctx).site
  if (!site) return false
  // A demo keeps nothing worth keeping: it is reset every few hours (adr-0186).
  if (isDemoInstallation(ctx.state)) return false
  // Stopped databases cannot be dumped; the night is left untried, so a resume soon enough still backs up.
  if (anySuspended(ctx)) return false
  const store = new BackupStore(ctx.state)
  const now = ctx.now()
  const time = store.time()
  const due = lastDue(now, time)
  const night = nightOf(due)
  if (store.log().triedNight === night) return false
  const root = ctx.state.root
  const wasHeld = held.get(root)
  // A night before the site was here was not missed: there was nothing to back up.
  if (Date.parse(site.settings.installedAt) > due.getTime()) {
    store.record({ triedNight: night })
    return false
  }
  if (onDay(due, 1, time).getTime() - now.getTime() < NEXT_SOON_MS) {
    held.delete(root)
    if (wasHeld?.night !== night) {
      store.record({ triedNight: night })
      return false
    }
    const error = `The nightly backup due at ${clock(due)} was skipped: the ${wasHeld.holder} that held the machine from ${clock(wasHeld.since)} had not finished in time for it. The next is taken at its own time.`
    store.record({ triedNight: night, last: { at: now.toISOString(), ok: false, error } })
    return false
  }
  const holder = holding()
  if (holder) {
    // Not tried yet: the next tick backs up as soon as the machine is free.
    if (wasHeld?.night !== night) held.set(root, { night, holder, since: now })
    return false
  }
  held.delete(root)
  store.record({ triedNight: night })
  const before = JSON.stringify(store.log().last ?? null)
  try {
    await exclusive('backup', () => takeBackup(ctx, 'nightly'))
    return true
  } catch (err) {
    // A backup that fails part-way is logged by takeBackup; one refused before it began is logged here.
    if (JSON.stringify(store.log().last ?? null) === before) {
      store.record({ last: { at: now.toISOString(), ok: false, error: err instanceof Error ? err.message : String(err) } })
    }
    return false
  }
}

export function startNightlyBackups(ctx: Context, everyMs = 60_000): () => void {
  let ticking = false
  const timer = setInterval(() => {
    if (ticking) return
    ticking = true
    nightlyTick(ctx).finally(() => {
      ticking = false
    })
  }, everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
