/**
 * What both sides of hq's move do to the machine around them (hqSend.ts, hqReceive.ts): asking hq through its control
 * socket, pointing this machine's pin where hq answers now, and starting or stopping hq, its site and the Fleet Console
 * beside them.
 */
import type { HqCommandResult } from '../hq/control'
import { installed, type Context } from '../service/context'
import { consoleHere } from '../install/console'
import { readPin, writePin } from '../link/pin'
import type { PinBefore } from './record'

export async function hqSays(ctx: Context, command: string, args: string[] = []): Promise<HqCommandResult | null> {
  return ctx.hqControl.run(command, args).catch(() => null)
}

/** Whether hq answers on this machine by `until` (ms, the service's clock). */
export async function hqAnswersBy(ctx: Context, until: number, pollMs: number): Promise<boolean> {
  for (;;) {
    if (await ctx.hqControl.status().catch(() => null)) return true
    if (ctx.now().getTime() + pollMs > until) return false
    await ctx.sleep(pollMs)
  }
}

/** Where this machine's link dials, as it was before the move changed it. */
export function pinNow(ctx: Context): PinBefore | null {
  const pin = readPin(ctx.state)
  return pin ? { hqAddress: pin.hqAddress, local: pin.local } : null
}

/** Points the pin at `to` and dials again; nothing when no Fleet Console is pinned. */
export function pointPin(ctx: Context, to: PinBefore): void {
  const pin = readPin(ctx.state)
  if (!pin || (pin.hqAddress === to.hqAddress && pin.local === to.local)) return
  writePin(ctx.state, { ...pin, hqAddress: to.hqAddress, local: to.local })
  ctx.link?.stop()
  ctx.link?.start()
}

export async function stopHqAndSite(ctx: Context): Promise<void> {
  const here = installed(ctx)
  if (here.site) await ctx.docker.composeStop(here.site.project, here.site.file)
  if (here.hq) await ctx.docker.composeStop(here.hq.project, here.hq.file)
}

/** hq first, so its site finds it. */
export async function startHqAndSite(ctx: Context): Promise<void> {
  const here = installed(ctx)
  if (here.hq) await ctx.docker.composeUp(here.hq.project, here.hq.file)
  if (here.site) await ctx.docker.composeUp(here.site.project, here.site.file)
}

export async function stopConsoleHere(ctx: Context): Promise<boolean> {
  const fleetConsole = consoleHere(ctx)
  if (!fleetConsole?.settings.onHqMachine) return false
  await ctx.docker.composeStop(fleetConsole.project, fleetConsole.file)
  return true
}

export async function startConsoleHere(ctx: Context): Promise<void> {
  const fleetConsole = consoleHere(ctx)
  if (fleetConsole?.settings.onHqMachine) await ctx.docker.composeUp(fleetConsole.project, fleetConsole.file)
}

export type ReadOnlyKept = { stop: () => Promise<void> }

/**
 * hq keeps read-only in memory, so an hq that starts again during the move — a crash, a restart — would come back
 * writable. Until the move ends, it is told again every `everyMs`: `read-only on` changes nothing on an hq that is
 * read-only already. `stop` waits for a word on its way, so none lands after the `read-only off` that ends the move.
 */
export function keepReadOnly(ctx: Context, machine: string, everyMs: number): ReadOnlyKept {
  let saying: Promise<unknown> | null = null
  let stopped = false
  const timer = setInterval(() => {
    if (stopped || saying) return
    saying = hqSays(ctx, 'read-only', ['on', machine]).finally(() => { saying = null })
  }, Math.max(everyMs, 1))
  timer.unref?.()
  return {
    stop: async () => {
      stopped = true
      clearInterval(timer)
      await saying
    },
  }
}
