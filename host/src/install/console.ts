/**
 * The Fleet Console's container (host-management spec §7): started by `install` on HQ's machine, admitted to HQ by
 * the pairing secret set in both; or by `console install <hq address> <code>` on another machine, admitted by the
 * one-time code a machine admin of HQ's machine made. Its settings and compose file are in the state folder, its
 * keys in its own volume, which backups take with the site. `console remove` takes it away, keys and all.
 */
import fs from 'node:fs'
import { isFingerprint, normalizeJoinCode } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { composeJson } from '../compose/projects'
import { CONSOLE_ADDRESS, consoleProject, type ConsoleAdmission, type ConsoleSettings } from '../compose/console'
import { checkImages, fetchImages, type ImagePins } from '../images/images'
import { installSecrets } from '../state/secrets'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd, product } from '../cli/words'
import { hqAddressProblem } from '../link/socket'
import { connectedOrEnded, everyMachineFollows, HANDOVER_STATUS_COMMAND, pollTakeover, type TakeoverStatus } from '../link/consoleMove'
import { forgetRetired } from '../link/handover'
import { readPin } from '../link/pin'
import { remoteAccessPort } from '../remoteAccess/state'
import { installSubnets } from '../compose/subnets'

export type StoredConsole = ConsoleSettings

export function consoleHere(ctx: Context): { settings: StoredConsole; file: string; project: string } | null {
  const settings = ctx.state.readJson('console', 'settings.json') as StoredConsole | null
  return settings ? { settings, file: ctx.state.path('console', 'compose.json'), project: ctx.names.consoleProject } : null
}

/**
 * Whether HQ lets the Fleet Console here in, as it says itself: `refused` from HQ's refusal of its credential or code
 * until HQ lets it in again — retired by one installed elsewhere, most likely. Only shown, never acted on alone.
 */
export type HqReach = 'connected' | 'refused' | 'notConnected'
export type ConsoleSays = { fingerprint: string | null; hq: HqReach | null }

const REACH: readonly string[] = ['connected', 'refused', 'notConnected'] satisfies HqReach[]

/** What the Fleet Console running here says of itself; null while it does not answer. */
export async function consoleHereSays(ctx: Context, timeoutMs = 30_000): Promise<ConsoleSays | null> {
  const r = await ctx.docker.exec(ctx.names.consoleContainer, HANDOVER_STATUS_COMMAND, '', timeoutMs).catch(() => null)
  if (!r || r.code !== 0) return null
  try {
    const answer = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { fingerprint?: unknown; hq?: unknown }
    return {
      fingerprint: isFingerprint(answer.fingerprint) ? answer.fingerprint : null,
      hq: typeof answer.hq === 'string' && REACH.includes(answer.hq) ? answer.hq as HqReach : null,
    }
  } catch {
    return null
  }
}

/** Stops the Fleet Console here and removes it with its volume, so its keys go with it. */
export async function takeConsoleAway(ctx: Context): Promise<void> {
  const here = consoleHere(ctx)
  if (!here) return
  await ctx.docker.composeDownWithVolumes(here.project, here.file)
  fs.rmSync(ctx.state.path('console', 'settings.json'), { force: true })
  fs.rmSync(here.file, { force: true })
}

/** Writes the Fleet Console's settings and compose file, and starts it. */
export async function writeAndStartConsole(ctx: Context, settings: StoredConsole, admission: ConsoleAdmission): Promise<void> {
  ctx.state.writeJson(['console', 'settings.json'], settings)
  const project = consoleProject(ctx.names, settings, ctx.machine.name, admission, await installSubnets(ctx), remoteAccessPort(ctx))
  const file = ctx.state.writePrivate(['console', 'compose.json'], composeJson(project))
  await ctx.docker.composeUp(ctx.names.consoleProject, file)
}

/**
 * HQ's local listener, which this host service reaches HQ at on HQ's own machine. The Fleet Console there, on a
 * Docker network, dials hq-web over HQ's link network instead (compose/console.ts).
 */
export const localHqAddress = (port: number) => `http://127.0.0.1:${port}`

/** On HQ's machine: the Fleet Console beside HQ, admitted by the pairing secret set in both. */
export async function startLocalConsole(ctx: Context, hq: { port: number; version: string }, images: ImagePins): Promise<void> {
  const kept = consoleHere(ctx)?.settings
  const settings: StoredConsole = {
    version: hq.version, images, hqAddress: localHqAddress(hq.port), onHqMachine: true,
    installedAt: kept?.installedAt ?? ctx.now().toISOString(),
  }
  await writeAndStartConsole(ctx, settings, { pairingSecret: installSecrets(ctx.state).consolePairingSecret })
}

export type ConsoleInstallResult = {
  machine: string
  address: string
  /** Whether it took the running Fleet Console's place, as it said last; null when it had not answered yet. */
  takeover: TakeoverStatus | null
}

/** `console install <hq address> <code>`: the Fleet Console on this machine instead of HQ's (spec §7). */
export async function installConsoleElsewhere(ctx: Context, address: string, rawCode: string, progress: (p: Progress) => void): Promise<ConsoleInstallResult> {
  if (consoleHere(ctx)) throw await alreadyHere(ctx)
  const problem = hqAddressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be reached at ${address}: ${problem}.`)
  const code = normalizeJoinCode(rawCode)
  if (!code) throw new Refusal('malformed', 'That is not a code: a code is twelve letters and digits, as HQ\'s machine printed it.')
  const version = ctx.machine.hostServiceVersion
  progress({ event: 'step', step: `Checking the image is signed by ${product}` })
  const { pins, checked } = await checkImages(ctx, [{ part: 'console', version }])
  await fetchImages(ctx, [pins.console!])
  progress({ event: 'stepDone', outcome: checked ? 'passes' : 'not checked: images built here (development build)' })
  progress({ event: 'step', step: `Starting the Fleet Console on ${CONSOLE_ADDRESS.replace('http://', '')}` })
  await writeAndStartConsole(ctx, {
    version, images: { console: pins.console }, hqAddress: address, onHqMachine: false, installedAt: ctx.now().toISOString(),
  }, { hqCode: code })
  forgetRetired(ctx.state)
  progress({ event: 'stepDone', outcome: 'started' })

  progress({ event: 'step', step: 'Connecting it to HQ' })
  let takeover = await pollTakeover(ctx, ctx.waits.siteMs, connectedOrEnded)
  progress({ event: 'stepDone', outcome: takeover?.state === 'failed' ? 'refused' : takeover && connectedOrEnded(takeover) ? 'connected' : 'not yet' })
  if (takeover?.state === 'handedOver') {
    progress({ event: 'step', step: 'Machines pin its new key' })
    takeover = (await pollTakeover(ctx, ctx.waits.siteMs, everyMachineFollows)) ?? takeover
    const t = takeover.state === 'handedOver' ? takeover : null
    progress({ event: 'stepDone', outcome: t ? `${t.repinned} of ${t.hosts}` : 'done' })
  }
  return { machine: ctx.machine.name, address: CONSOLE_ADDRESS, takeover }
}

async function alreadyHere(ctx: Context): Promise<Refusal> {
  const hq = (await consoleHereSays(ctx, 10_000))?.hq ?? null
  const runs = `The Fleet Console already runs on ${ctx.machine.name}, at ${CONSOLE_ADDRESS}`
  const away = `take it away first: ${cmd('console remove')}`
  if (hq === 'refused') return new Refusal('already_installed', `${runs}, but HQ refuses to let it in: it may have been retired. Nothing was changed. To install a new one here, ${away}`)
  if (hq === 'connected') return new Refusal('already_installed', `${runs}. Nothing was changed.`)
  return new Refusal('already_installed', `${runs}. Nothing was changed. If it no longer runs the fleet, ${away}`)
}

export type ConsoleRemoveCheck = { machine: string; hq: HqReach | null }
export type ConsoleRemoved = { machine: string; removed: true }

/**
 * `console remove`: a Fleet Console HQ no longer lets in — retired while this machine was outside the fleet, so no
 * certificate told it — goes only on the machine admin's word, never on HQ's. Unconfirmed, it only checks. Refused
 * while this machine answers it: on HQ's machine that is the fleet's own; elsewhere this machine disconnects first.
 */
export async function removeConsoleHere(ctx: Context, confirmed: boolean): Promise<ConsoleRemoveCheck | ConsoleRemoved> {
  const machine = ctx.machine.name
  const here = consoleHere(ctx)
  if (!here) throw new Refusal('not_installed', `No Fleet Console runs on ${machine}. Nothing was changed.`)
  const pin = readPin(ctx.state)
  if (pin?.local) {
    throw new Refusal('conflict', `The Fleet Console on ${machine} is the fleet's own: HQ's machine answers it. Nothing was changed. To run it on another machine instead: ${cmd('hq console-code')}`)
  }
  const says = await consoleHereSays(ctx, 10_000)
  if (pin && says?.fingerprint === pin.consoleFingerprint) {
    throw new Refusal('conflict', `${machine} answers the Fleet Console that runs here, so it is in use. Nothing was changed. If it is to go, first: ${cmd('console disconnect')}`)
  }
  if (!confirmed) return { machine, hq: says?.hq ?? null }
  await takeConsoleAway(ctx)
  forgetRetired(ctx.state)
  return { machine, removed: true }
}
