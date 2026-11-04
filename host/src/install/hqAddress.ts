/**
 * `agenthix hq address <address>`, or the Fleet Console's *Move HQ…* to a new address (`address.set` for hq), on hq's
 * machine (host-management spec §13): changing hq's address is a move. hq tells every connected site, host service
 * and the Fleet Console the new address over the connection each already has (`address-move` on its control socket),
 * and everyone in hq; then it stops, so nothing changes between the backup and the switch; a sealed backup is taken;
 * and hq starts again at the new address. Each that was told switches once the new address passes its move check.
 *
 * If hq does not answer at the new address, everything is put back: hq starts again at the old one, and those told
 * are told it stays. The default site and the Fleet Console here reach hq on this machine, not at its address, so
 * they need nothing beyond hq's local port, when that moves too.
 */
import type { Progress } from '../sockets/lineServer'
import { installed, type Context, type StoredHq } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { exclusive, takeBackup } from '../backups/take'
import { startDatabases, startTarget, stopTarget, writeProjects } from '../upgrades/rollback'
import { frontDoorSettings } from '../frontDoor/frontDoor'
import { readPin, writePin } from '../link/pin'
import type { Told } from '../cli/hqAddressWords'
import { filesOriginKept } from '../frontDoor/given'
import { addressProblem, listenerFor } from './address'
import { localHqAddress, consoleHere, writeAndStartConsole } from './console'
import { installSecrets } from '../state/secrets'
import { installationOf, recordPorts } from '../state/installation'
import { chooseHqPort } from './ports'
import { checkPorts } from './portCheck'

export type HqAddressResult = { address: string; previous: string; told: Told | null }

async function step<T>(progress: (p: Progress) => void, name: string, work: () => Promise<T>, outcome: (v: T) => string = () => 'done'): Promise<T> {
  progress({ event: 'step', step: name })
  const value = await work()
  progress({ event: 'stepDone', outcome: outcome(value) })
  return value
}

function toldOf(data: unknown): Told | null {
  const d = data as { sites?: { told?: unknown; of?: unknown }; hosts?: { told?: unknown; of?: unknown }; console?: unknown } | undefined
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
  const sites = { told: n(d?.sites?.told), of: n(d?.sites?.of) }
  const hosts = { told: n(d?.hosts?.told), of: n(d?.hosts?.of) }
  if (sites.told === null || sites.of === null || hosts.told === null || hosts.of === null) return null
  return { sites: { told: sites.told, of: sites.of }, hosts: { told: hosts.told, of: hosts.of }, console: d?.console === true }
}

export async function moveHqAddress(ctx: Context, raw: string, progress: (p: Progress) => void): Promise<HqAddressResult> {
  const address = raw.trim()
  const hq = installed(ctx).hq
  if (!hq) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ. These commands run on HQ's own machine.`)
  const problem = addressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be at ${address}: ${problem}.`)
  const previous = hq.settings.address
  if (address.toLowerCase() === previous.toLowerCase()) throw new Refusal('conflict', `HQ is already at ${address}. Nothing was changed.`)
  if (frontDoorSettings(ctx)?.on) {
    throw new Refusal('conflict', `The front door serves HQ at ${previous}. Turn it off first (${cmd('front-door off')}), change the address, then turn it on again for the new one. Nothing was changed.`)
  }
  // A plain-http address carries hq's port with it; an https one keeps the port recorded.
  const was = installationOf(ctx.state).ports.hq
  const port = chooseHqPort(address, undefined, was)
  await checkPorts(ctx, [{ port, part: 'hq', bind: listenerFor(address).bind, another: "Give HQ an address on another port." }])
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine. Nothing was changed.')
  return exclusive('move of HQ to a new address', () => run(ctx, hq.settings, address, { was, now: port }, paths, progress))
}

async function run(
  ctx: Context, before: StoredHq, address: string, port: { was: number | null; now: number }, paths: { state: string }, progress: (p: Progress) => void,
): Promise<HqAddressResult> {
  const site = installed(ctx).site!.settings
  const told = await step(progress, "Telling HQ's sites and host services the new address", async () => {
    const answer = await ctx.hqControl.run('address-move', [address])
    if (!answer) throw new Refusal('failed', `HQ is not answering on this machine, so it could tell no one its new address. Nothing was changed. See how it is doing: ${cmd('status')}`)
    if (!answer.ok) throw new Refusal('failed', `HQ refused: ${answer.error} Nothing was changed.`)
    return toldOf(answer.data)
  }, t => (t ? `${t.sites.told + t.hosts.told} told` : 'done'))

  const putBack = async (why: string): Promise<never> => {
    recordPorts(ctx.state, { hq: port.was })
    await writeProjects(ctx, before, site, paths)
    const restarted = await startTarget(ctx, 'hq').then(() => null, (err: unknown) => (err instanceof Error ? err.message : String(err)))
    if (restarted !== null) {
      throw new Refusal('failed', `${why} HQ's old address, ${before.address}, is recorded again, but HQ did not start there: ${restarted.replace(/\.?$/, '.')} See how it is doing: ${cmd('status')}`)
    }
    // HQ at its old address again: those it told stop waiting.
    await ctx.hqControl.run('address-move', [before.address]).catch(() => null)
    throw new Refusal('failed', `${why} HQ is at ${before.address} again, and those it told were told it stays.`)
  }

  await step(progress, 'Stopping HQ and its site', () => stopTarget(ctx, 'hq'))
  await step(progress, 'Taking a sealed backup', async () => {
    try {
      await startDatabases(ctx, 'hq')
      return await takeBackup(ctx, 'now')
    } catch (err) {
      return putBack(`Not moved, since a move takes a backup first: ${(err instanceof Error ? err.message : String(err)).replace(/\.?$/, '.')}`)
    }
  })

  const moved: StoredHq = { ...before, address, ...listenerFor(address), filesOrigin: filesOriginKept(ctx.state, address) }
  await step(progress, `Starting HQ at ${address}`, async () => {
    try {
      recordPorts(ctx.state, { hq: port.now })
      await writeProjects(ctx, moved, site, paths)
      await startTarget(ctx, 'hq')
    } catch (err) {
      await stopTarget(ctx, 'hq').catch(() => {})
      return putBack(`HQ could not start at ${address}: ${(err instanceof Error ? err.message : String(err)).replace(/\.?$/, '.')}`)
    }
  })
  const answered = await step(progress, 'HQ answers at its new address', async () => {
    const until = ctx.now().getTime() + ctx.waits.hqMs
    for (;;) {
      const status = await ctx.hqControl.status()
      if (status?.address.replace(/\/+$/, '').toLowerCase() === address.toLowerCase()) return true
      if (ctx.now().getTime() >= until) return false
      await ctx.sleep(ctx.waits.pollMs)
    }
  }, ok => (ok ? 'passes' : 'fails'))
  if (!answered) {
    await stopTarget(ctx, 'hq').catch(() => {})
    return putBack(`HQ did not answer at ${address} within ${Math.round(ctx.waits.hqMs / 60_000)} minutes.`)
  }

  if (port.now !== port.was) await followLocalPort(ctx, port.now)
  return { address, previous: before.address, told }
}

/** This machine's pin and the Fleet Console here reach hq on its local port: they follow it when it moves. */
async function followLocalPort(ctx: Context, hqPort: number): Promise<void> {
  const local = localHqAddress(hqPort)
  const pin = readPin(ctx.state)
  // This runs on hq's own machine: its pin reaches hq locally whether the Fleet Console is here or, after a hand-over, elsewhere.
  if (pin) {
    writePin(ctx.state, { ...pin, hqAddress: local })
    ctx.link?.stop()
    ctx.link?.start()
  }
  const fleetConsole = consoleHere(ctx)
  if (fleetConsole?.settings.onHqMachine) {
    await writeAndStartConsole(ctx, { ...fleetConsole.settings, hqAddress: local }, { pairingSecret: installSecrets(ctx.state).consolePairingSecret })
  }
}
