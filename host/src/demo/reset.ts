/**
 * A demo's reset (adr-0186; the live demo spec's *Reset*): hq and its site stopped, their containers, databases and
 * storage removed, and both started again, so each seeds the sample organisation afresh as it starts on empty data.
 * Nothing is backed up. Every `DEMO_RESET_EVERY_HOURS`, at the times core's `nextDemoReset` gives — the same times hq
 * counts down to — and on `agenthix demo reset`.
 *
 * Refused on an installation that is not a demo: on any other it would be an erase with no backup. Networks are kept,
 * so a front door another installation runs, joined to this one's edge network, stays joined. One at a time, and never
 * while a backup, restore, upgrade or move holds the machine (`exclusive`).
 */
import fs from 'node:fs'
import { DEMO_RESET_EVERY_HOURS, nextDemoReset } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import type { Progress } from '../sockets/lineServer'
import { Refusal } from '../owner/results'
import { exclusive } from '../backups/take'
import { anySuspended } from '../lifecycle/suspend'
import { isDemoInstallation } from '../state/installation'
import { cmd } from '../cli/words'

const HQ_CONTAINERS = ['hq-web', 'relay', 'hq-server', 'hq-db'] as const

/** What `demo.reset` answers: when it was reset, and the next scheduled reset. */
export type DemoResetResult = { resetAt: string; nextResetAt: string }

/** What `demo.reset` answers before it is confirmed: that it would go ahead, and what it would remove. */
export type DemoResetCheck = { address: string; nextResetAt: string }

/** Refuses, in words, a reset this installation cannot have. */
export function demoResetCheck(ctx: Context): DemoResetCheck {
  if (!isDemoInstallation(ctx.state)) {
    throw new Refusal('conflict', `This installation is not a demo, so it is never reset: ${ctx.machine.name}'s HQ and its data stay as they are. Nothing was changed.`)
  }
  const { hq, site } = installed(ctx)
  if (!hq || !site) throw new Refusal('not_installed', `No demo is installed here yet. To install one: ${cmd('install --demo')}`)
  if (anySuspended(ctx)) throw new Refusal('conflict', `The demo is suspended. Resume it first: ${cmd('hq resume')}`)
  return { address: hq.settings.address, nextResetAt: nextDemoReset(ctx.now()).toISOString() }
}

function step(progress: (p: Progress) => void, name: string) {
  progress({ event: 'step', step: name })
  return (outcome = 'done') => progress({ event: 'stepDone', outcome })
}

async function waitFor(ctx: Context, limitMs: number, probe: () => Promise<boolean>): Promise<boolean> {
  const until = ctx.now().getTime() + limitMs
  for (;;) {
    if (await probe()) return true
    if (ctx.now().getTime() >= until) return false
    await ctx.sleep(ctx.waits.pollMs)
  }
}

/** Empties the site's data folder, a bind mount in the state folder, keeping the folder itself. */
function emptySiteData(ctx: Context): void {
  const dir = ctx.state.path('site', 'data')
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) fs.rmSync(`${dir}/${entry}`, { recursive: true, force: true })
}

async function removeAndStart(ctx: Context, progress: (p: Progress) => void): Promise<void> {
  const { hq, site } = installed(ctx)
  if (!hq || !site) throw new Refusal('not_installed', 'The demo is not installed here any more.')
  const removal = ctx.docker.removal()
  const n = ctx.names

  let done = step(progress, 'Stopping the demo')
  await ctx.docker.composeStop(site.project, site.file)
  await ctx.docker.composeStop(hq.project, hq.file)
  done()

  done = step(progress, 'Removing its databases and storage')
  for (const name of [n.siteContainer, n.container('site-db'), ...HQ_CONTAINERS.map(p => n.container(p))]) await removal.container(name)
  for (const volume of [n.siteDbVolume, n.hqDbVolume, n.hqStorageVolume]) await removal.volume(volume)
  emptySiteData(ctx)
  done()

  done = step(progress, 'Starting HQ')
  await ctx.docker.composeUp(hq.project, hq.file)
  const answered = await waitFor(ctx, ctx.waits.hqMs, async () => (await ctx.hqControl.status()) !== null)
  if (!answered) {
    done('fails')
    throw new Refusal('failed', `HQ did not answer within ${Math.round(ctx.waits.hqMs / 60_000)} minutes after the reset. See why: ${cmd('hq logs')}`)
  }
  done('answers')

  done = step(progress, 'Starting the site')
  await ctx.docker.composeUp(site.project, site.file)
  const connected = await waitFor(ctx, ctx.waits.siteMs, async () => (await ctx.hqControl.status())?.hqSite.state === 'connected')
  done(connected ? 'connected to HQ' : 'not connected yet')
}

/**
 * The record of the last reset that finished, so a reset missed while the host service was down is caught up. Kept in
 * hq's folder of the state folder, which goes with the demo when it is erased or uninstalled.
 */
const LAST_RESET_FILE = ['hq', 'demo-reset.json']
const PERIOD_MS = DEMO_RESET_EVERY_HOURS * 60 * 60 * 1000

/** A scheduled reset that failed is tried again after this long, and again after each failure until one finishes. */
export const DEMO_RESET_RETRY_MS = 10 * 60 * 1000

/** When the demo was last reset; null when no reset was recorded or the record cannot be read. */
export function lastDemoReset(ctx: Context): Date | null {
  try {
    const at = (ctx.state.readJson(...LAST_RESET_FILE) as { lastResetAt?: unknown } | null)?.lastResetAt
    const date = typeof at === 'string' ? new Date(at) : null
    return date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

function recordReset(ctx: Context, at: Date): void {
  ctx.state.writeJson(LAST_RESET_FILE, { lastResetAt: at.toISOString() })
}

let resetting = false

/** Resets the demo now. `confirmed` is set by the CLI once the person agreed, and by the schedule; without it, only checks. */
export async function resetDemo(ctx: Context, confirmed: boolean, progress: (p: Progress) => void): Promise<DemoResetCheck | DemoResetResult> {
  const check = demoResetCheck(ctx)
  if (!confirmed) return check
  if (resetting) throw new Refusal('busy', 'The demo is already being reset. Wait for it to finish.')
  resetting = true
  try {
    await exclusive('demo reset', () => removeAndStart(ctx, progress))
  } finally {
    resetting = false
  }
  const at = ctx.now()
  recordReset(ctx, at)
  return { resetAt: at.toISOString(), nextResetAt: nextDemoReset(at).toISOString() }
}

/**
 * The schedule: checked every `everyMs`, it resets at each time `nextDemoReset` gives. At start, a demo whose last
 * recorded reset came before the most recent scheduled time — that one was missed while the host service was down —
 * is reset at once; one
 * with no record yet is recorded as reset now, since it was just installed or seeded. A reset that fails is said in the
 * log and tried again after `DEMO_RESET_RETRY_MS`, and again after each failure until one finishes (never later than
 * the next scheduled time); it is not recorded, so a restart catches it up too. Does nothing on an installation that is
 * not a demo.
 */
export function demoResetSchedule(ctx: Context, log: (line: string) => void): { tick: () => Promise<void> } {
  let due = nextDemoReset(ctx.now())
  if (isDemoInstallation(ctx.state)) {
    const last = lastDemoReset(ctx)
    if (last === null) recordReset(ctx, ctx.now())
    else if (last.getTime() < due.getTime() - PERIOD_MS) due = ctx.now()
  }
  let busy = false
  /** The scheduled reset that failed and is being tried again; null while none is. */
  let failedReset: Date | null = null
  const tick = async () => {
    if (busy || ctx.now() < due) return
    busy = true
    const at = due
    due = nextDemoReset(ctx.now())
    try {
      if (!isDemoInstallation(ctx.state) || !installed(ctx).hq) return
      log(failedReset
        ? `Trying the demo's reset again: the reset scheduled for ${failedReset.toISOString()} failed.`
        : `Resetting the demo, as scheduled for ${at.toISOString()}.`)
      await resetDemo(ctx, true, p => { if (p.event === 'step') log(`Demo reset: ${p.step}`) })
      failedReset = null
      log(`The demo was reset. The next reset is at ${due.toISOString()}.`)
    } catch (err) {
      const retryAt = new Date(Math.min(ctx.now().getTime() + DEMO_RESET_RETRY_MS, nextDemoReset(ctx.now()).getTime()))
      due = retryAt
      const why = err instanceof Error ? err.message : String(err)
      log(failedReset
        ? `Trying the demo's reset again failed: ${why} It will be tried again at ${retryAt.toISOString()}.`
        : `The demo's reset scheduled for ${at.toISOString()} failed: ${why} It will be tried again at ${retryAt.toISOString()}.`)
      failedReset ??= at
    } finally {
      busy = false
    }
  }
  return { tick }
}

export function startDemoResets(ctx: Context, log: (line: string) => void, everyMs = 30_000): () => void {
  const { tick } = demoResetSchedule(ctx, log)
  const timer = setInterval(() => void tick(), everyMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
