/**
 * Scheduled changes (host-management spec §14; diagrams 6 and 6b): held by this host service and run at their
 * time. From scheduling, hq hears of each one; a few minutes before (`SCHEDULED_CHANGE_PAUSE_LEAD_MS`) it is
 * *pausing*, so hq starts no new runs on what it affects; at its time it runs; then it is done, or it failed and
 * was put back as it was. Changing or cancelling one sends an updated notice the same way.
 *
 * Everything lives in the state folder, so a restart of the host service loses nothing: a change whose time passed
 * while the service was down runs late if it is within `MISSED_AFTER_MS`, and is otherwise reported missed.
 */
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS } from '@agenthix/core'
import type { ChangeRequest, ScheduledBy, ScheduledChange, ScheduledChangeNotice, ScheduledChangeUpdate } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { runnerFor } from './registry'
import { prune, readStore, withStore, type ScheduledEntry, type ScheduledFile } from './store'
import { whenText } from './time'
import { changeName } from './words'
import { deliverNotices } from './notices'
import { cmd } from '../cli/words'
import { holding, waitingText } from '../backups/take'

/** A change this late is still run; later than this, it is reported missed rather than run at a time nobody chose. */
export const MISSED_AFTER_MS = 30 * 60_000

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ENDED = new Set<ScheduledChange['state']>(['done', 'rolledBack', 'cancelled', 'missed'])

/** Changes this process is running now, by state folder and id: a tick never starts one twice. */
const running = new Set<string>()

function noticeOf(entry: ScheduledEntry, update: ScheduledChangeUpdate, now: Date, reason: string | null = null): void {
  // Strictly later than the last, so hq can always tell the newer of two notices apart.
  const last = entry.notice ? Date.parse(entry.notice.sentAt) : 0
  const sentAt = new Date(Math.max(now.getTime(), last + 1)).toISOString()
  const notice: ScheduledChangeNotice = { update, change: { ...entry.change, machine: { ...entry.change.machine } }, sentAt, reason }
  entry.notice = notice
  entry.delivered = false
  entry.toldConsole = false
}

function end(entry: ScheduledEntry, state: ScheduledChange['state'], update: ScheduledChangeUpdate, now: Date, reason: string | null = null): void {
  entry.change.state = state
  entry.endedAt = now.toISOString()
  noticeOf(entry, update, now, reason)
}

function find(file: ScheduledFile, id: string): ScheduledEntry {
  const entry = file.entries.find(e => e.change.id === id)
  if (!entry || entry.endedAt) {
    throw new Refusal('not_found', `Nothing is scheduled as ${id}. To see what is: ${cmd('scheduled')}`)
  }
  return entry
}

function future(at: string, now: Date): Date {
  const when = new Date(at)
  if (when.getTime() <= now.getTime()) {
    throw new Refusal('conflict', `Not scheduled: ${whenText(when, now)} has passed. It is ${whenText(now, now)} now; choose a later time.`)
  }
  return when
}

export async function scheduleChange(ctx: Context, request: ChangeRequest, at: string, by: ScheduledBy): Promise<ScheduledChange> {
  const runner = runnerFor(request)
  if (!runner) {
    throw new Refusal('failed', 'This version of the host service cannot schedule that yet.')
  }
  const target = runner.target(request)
  const here = installed(ctx)
  if (!here[target]) {
    throw new Refusal('not_installed', target === 'hq'
      ? `No HQ here: ${ctx.machine.name} runs no HQ, so there is nothing of HQ's to schedule.`
      : `No site runs on ${ctx.machine.name}, so there is nothing of a site's to schedule.`)
  }
  const now = ctx.now()
  const when = future(at, now)
  runner.check(ctx, request)
  const change = await withStore(ctx.state, file => {
    const entry: ScheduledEntry = {
      change: {
        id: String(file.nextId++),
        kind: runner.kind,
        target,
        siteName: here.site?.settings.name ?? ctx.machine.name,
        machine: { name: ctx.machine.name, fingerprint: file.machineId },
        at: when.toISOString(),
        scheduledBy: by,
        scheduledAt: now.toISOString(),
        state: 'scheduled',
        detail: runner.detail(ctx, request),
        expectedMinutes: runner.expectedMinutes,
      },
      request,
      notice: null,
      delivered: false,
      endedAt: null,
      owner: here[target]!.settings.installedAt,
    }
    noticeOf(entry, 'scheduled', now)
    file.entries.push(entry)
    return entry.change
  })
  void deliverNotices(ctx).catch(() => {})
  return change
}

export async function changeScheduled(ctx: Context, id: string, at: string): Promise<ScheduledChange> {
  const now = ctx.now()
  const when = future(at, now)
  const change = await withStore(ctx.state, file => {
    const entry = find(file, id)
    if (entry.change.state === 'running') throw new Refusal('conflict', `${cap(changeName(entry.change, true))} is running now; its time cannot change.`)
    entry.change.at = when.toISOString()
    entry.change.state = 'scheduled'
    noticeOf(entry, 'changed', now)
    return entry.change
  })
  void deliverNotices(ctx).catch(() => {})
  return change
}

export async function cancelScheduled(ctx: Context, id: string): Promise<ScheduledChange> {
  const now = ctx.now()
  const change = await withStore(ctx.state, file => {
    const entry = find(file, id)
    if (entry.change.state === 'running') throw new Refusal('conflict', `${cap(changeName(entry.change, true))} is running now and cannot be cancelled.`)
    end(entry, 'cancelled', 'cancelled', now)
    return entry.change
  })
  void deliverNotices(ctx).catch(() => {})
  return change
}

/** The install a change targets, by when it was installed; null when there is none on the machine. */
function ownerNow(ctx: Context, target: ScheduledChange['target']): string | null {
  return installed(ctx)[target]?.settings.installedAt ?? null
}

/** Whether what the change was scheduled for is no longer on the machine: gone, or another in its place. */
const isGone = (ctx: Context, e: ScheduledEntry) => e.owner === undefined || e.owner !== ownerNow(ctx, e.change.target)

const goneReason = (ctx: Context, c: ScheduledChange) =>
  `${cap(changeName(c, true))} was cancelled: ${c.target === 'hq' ? 'HQ' : `the site ${c.siteName}`} is no longer on ${ctx.machine.name}.`

const isRunning = (ctx: Context, e: ScheduledEntry) => e.change.state === 'running' || running.has(`${ctx.state.root}\u0000${e.change.id}`)

/**
 * Ends, as cancelled with the reason, every open change whose HQ or site is no longer on the machine — erased,
 * removed, moved away, or replaced by a new one — and tells hq and the Fleet Console. One running is left to end.
 */
export async function endChangesOfWhatIsGone(ctx: Context): Promise<void> {
  if (readStore(ctx.state).entries.length === 0) return
  const now = ctx.now()
  const ended = await withStore(ctx.state, file => {
    let any = false
    for (const entry of file.entries) {
      if (entry.endedAt || isRunning(ctx, entry) || !isGone(ctx, entry)) continue
      end(entry, 'cancelled', 'cancelled', now, goneReason(ctx, entry.change))
      any = true
    }
    return any
  })
  if (ended) await deliverNotices(ctx).catch(() => {})
}

/** Cancels every open change that is not running, with `why` as its reason, and tells hq and the Fleet Console. */
export async function cancelAllScheduled(ctx: Context, why: string): Promise<void> {
  if (readStore(ctx.state).entries.length === 0) return
  const now = ctx.now()
  await withStore(ctx.state, file => {
    for (const entry of file.entries) {
      if (entry.endedAt || isRunning(ctx, entry)) continue
      end(entry, 'cancelled', 'cancelled', now, `${cap(changeName(entry.change, true))} was cancelled: ${why}.`)
    }
  })
  await deliverNotices(ctx).catch(() => {})
}

/** What is ahead or running, soonest first; never one whose HQ or site is gone, which the next tick ends. */
export function listScheduled(ctx: Context): ScheduledChange[] {
  return readStore(ctx.state).entries
    .filter(e => !e.endedAt && (isRunning(ctx, e) || !isGone(ctx, e)))
    .map(e => e.change)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

const missedReason = (c: ScheduledChange, now: Date) =>
  `The host service was not running at ${whenText(new Date(c.at), now)}, so ${changeName(c, true)} was not done. Nothing changed. Schedule it again for a new time.`

/** One pass: moves each change on as its time comes, runs what is due, and sends hq what changed. */
export async function tickScheduled(ctx: Context): Promise<void> {
  if (readStore(ctx.state).entries.length === 0) return
  const now = ctx.now()
  const due = await withStore(ctx.state, file => {
    prune(file, now)
    const toRun: ScheduledEntry[] = []
    for (const entry of file.entries) {
      const c = entry.change
      if (entry.endedAt || ENDED.has(c.state) || running.has(`${ctx.state.root}\u0000${c.id}`)) continue
      const at = Date.parse(c.at)
      if (c.state !== 'running' && isGone(ctx, entry)) {
        end(entry, 'cancelled', 'cancelled', now, goneReason(ctx, c))
      } else if (now.getTime() - at > MISSED_AFTER_MS) {
        end(entry, 'missed', 'missed', now, missedReason(c, now))
      } else if (now.getTime() >= at) {
        // A change found running is one a restart cut short: run it again, since each runs whole or not at all.
        if (c.state !== 'running') {
          c.state = 'running'
          // Due while a backup holds the machine, such as the nightly one: it starts by waiting for it, and says so.
          const holder = runnerFor(entry.request)?.holdsMachine ? holding() : null
          noticeOf(entry, 'started', now, holder ? waitingText(holder) : null)
        }
        toRun.push(entry)
      } else if (c.state === 'scheduled' && at - now.getTime() <= SCHEDULED_CHANGE_PAUSE_LEAD_MS) {
        c.state = 'pausing'
        noticeOf(entry, 'pausing', now)
      }
    }
    for (const e of toRun) running.add(`${ctx.state.root}\u0000${e.change.id}`)
    return toRun.map(e => ({ id: e.change.id, request: e.request }))
  })
  await deliverNotices(ctx).catch(() => {})
  for (const { id, request } of due) {
    const key = `${ctx.state.root}\u0000${id}`
    let failure: string | null = null
    try {
      const runner = runnerFor(request)
      if (!runner) throw new Error('This version of the host service cannot run it.')
      runner.check(ctx, request)
      // What it said it waits for may have ended since: it says so before it runs, and again as it waits.
      if (runner.holdsMachine) await waiting(ctx, id, holding())
      await runner.run(ctx, request, holder => waiting(ctx, id, holder))
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    }
    await withStore(ctx.state, file => {
      const entry = file.entries.find(e => e.change.id === id)
      if (!entry) return
      const done = ctx.now()
      if (failure === null) end(entry, 'done', 'completed', done)
      else end(entry, 'rolledBack', 'failed', done, `${cap(changeName(entry.change, true))} did not complete, and was put back as it was: ${failure}`)
    }).finally(() => running.delete(key))
    await deliverNotices(ctx).catch(() => {})
  }
}

/** Tells hq and the Fleet Console that a change that is due waits for what holds the machine, and when it no longer does. */
async function waiting(ctx: Context, id: string, holder: string | null): Promise<void> {
  const reason = holder ? waitingText(holder) : null
  const changed = await withStore(ctx.state, file => {
    const entry = file.entries.find(e => e.change.id === id)
    if (!entry || entry.endedAt || (entry.notice?.update === 'started' && entry.notice.reason === reason)) return false
    noticeOf(entry, 'started', ctx.now(), reason)
    return true
  })
  if (changed) await deliverNotices(ctx).catch(() => {})
}

/** Every `intervalMs`, a tick; returns the stop function. */
export function startScheduler(ctx: Context, intervalMs = 15_000, log: (line: string) => void = () => {}): () => void {
  let busy = false
  const tick = () => {
    if (busy) return
    busy = true
    tickScheduled(ctx).catch(err => log(`Scheduled changes: ${err instanceof Error ? err.message : String(err)}`)).finally(() => { busy = false })
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
