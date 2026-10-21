/**
 * Automatic fixes (spec §11): a newer patch version of what runs here is scheduled, with notice, for the start of
 * the maintenance window — on by default, and turned off or moved on the machine (`agenthix upgrades`). A new minor
 * or major version is never applied by itself, nor a fix that was rolled back once. Each is an ordinary scheduled
 * change, so HQ tells the people it affects and runs pause around it.
 */
import type { ScheduledChange } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { cancelScheduled, changeScheduled, listScheduled, scheduleChange } from '../scheduled/scheduler'
import { isPublishedVersion } from '../images/published'
import { finishUnderWay } from './upgrade'
import { nextWindowStart, readUpgrades, writeUpgrades, type LastCheck, type MaintenanceWindow } from './settings'
import { isFixOf, newest, PARTS_OF, publishedVersions, sameLine } from './versions'

/** The least notice a fix is scheduled with; a window sooner than this takes the next one. */
export const FIX_NOTICE_MS = 60 * 60_000
const CHECK_EVERY_MS = 6 * 3600_000

const WINDOW = { kind: 'maintenanceWindow' } as const

/** What runs here that upgrades, by its own target: HQ (with its site) on HQ's machine, else the site. */
export function upgradeTarget(ctx: Context): 'hq' | 'site' | null {
  const here = installed(ctx)
  return here.hq ? 'hq' : here.site ? 'site' : null
}

/** Asks the registry what is published and keeps the answer for `status`; fails closed, recording why. */
export async function checkPublished(ctx: Context): Promise<{ check: LastCheck; versions: string[] }> {
  const target = upgradeTarget(ctx)
  const at = ctx.now().toISOString()
  const [parts, host] = await Promise.all([
    target ? publishedVersions(ctx, PARTS_OF[target]) : Promise.resolve({ ok: true as const, versions: [] }),
    publishedVersions(ctx, ['host']),
  ])
  const check: LastCheck = parts.ok
    ? { at, versions: parts.versions, host: host.ok ? newest(host.versions) : null }
    : { at, problem: parts.problem }
  writeUpgrades(ctx.state, s => { s.lastCheck = check })
  return { check, versions: parts.ok ? parts.versions : [] }
}

const automaticAhead = (ctx: Context): ScheduledChange[] => {
  const ids = new Set(readUpgrades(ctx.state).automatic)
  return listScheduled(ctx).filter(c => ids.has(c.id))
}

/** Schedules the newest fix for the window when fixes are on and none is scheduled; null when it schedules none. */
export async function scheduleFix(ctx: Context, versions: string[]): Promise<ScheduledChange | null> {
  const s = readUpgrades(ctx.state)
  const target = upgradeTarget(ctx)
  if (!s.auto || !target) return null
  const current = installed(ctx)[target]!.settings.version
  const host = ctx.machine.hostServiceVersion
  if (!isPublishedVersion(current) || !isPublishedVersion(host)) return null
  const fix = newest(versions.filter(v => isFixOf(v, current) && sameLine(v, host) && !s.rolledBack.includes(`${target}@${v}`)))
  if (!fix) return null
  if (listScheduled(ctx).some(c => c.kind === 'upgrade' && c.target === target)) return null
  const at = nextWindowStart(s.window, ctx.now(), FIX_NOTICE_MS)
  const change = await scheduleChange(ctx, { op: 'upgrade', target, version: fix }, at.toISOString(), WINDOW)
  writeUpgrades(ctx.state, u => {
    const ahead = new Set(listScheduled(ctx).map(c => c.id))
    u.automatic = [...u.automatic.filter(id => ahead.has(id)), change.id]
  })
  return change
}

/** One pass: finishes an upgrade a restart cut short, then looks for a fix and schedules it. */
export async function upgradesTick(ctx: Context): Promise<void> {
  await finishUnderWay(ctx)
  const { versions } = await checkPublished(ctx)
  await scheduleFix(ctx, versions)
}

/**
 * Turns automatic fixes on or off, or moves the window. Off cancels the fixes the window scheduled; a new window
 * moves them to its next start. Then, when on, looks for a fix at once.
 */
export async function setUpgrades(ctx: Context, change: { auto?: boolean; window?: MaintenanceWindow }): Promise<void> {
  const s = writeUpgrades(ctx.state, u => {
    if (change.auto !== undefined) u.auto = change.auto
    if (change.window) u.window = change.window
  })
  for (const c of automaticAhead(ctx)) {
    if (c.state === 'running') continue
    if (!s.auto) await cancelScheduled(ctx, c.id)
    else if (change.window) {
      const at = nextWindowStart(s.window, ctx.now(), FIX_NOTICE_MS)
      if (at.toISOString() !== c.at) await changeScheduled(ctx, c.id, at.toISOString())
    }
  }
  if (s.auto) {
    const { versions } = await checkPublished(ctx)
    await scheduleFix(ctx, versions)
  }
}

/** Every few hours, a pass; the first a minute after the host service starts. Returns the stop function. */
export function startUpgrades(ctx: Context, log: (line: string) => void = () => {}): () => void {
  let busy = false
  const tick = () => {
    if (busy) return
    busy = true
    upgradesTick(ctx).catch(err => log(`Upgrades: ${err instanceof Error ? err.message : String(err)}`)).finally(() => { busy = false })
  }
  const first = setTimeout(tick, 60_000)
  const timer = setInterval(tick, CHECK_EVERY_MS)
  first.unref?.()
  timer.unref?.()
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
