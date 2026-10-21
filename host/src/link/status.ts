/**
 * Whether this machine answers a Fleet Console or Agenthix Cloud, and whether a Fleet Console runs here, for `agenthix
 * status` (spec §6, §7; pre-release spec B2).
 */
import { formatFingerprint } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { readReceive } from '../move/record'
import { partState, type PartState } from '../status/machineStatus'
import { consoleHere, consoleHereSays, type HqReach } from '../install/console'
import { CONSOLE_ADDRESS } from '../compose/console'
import { readPin } from './pin'
import { retiredHere } from './handover'
import { readMove, type HqMove } from './addressFollow'
import { cloudStatus, type CloudStatus } from '../cloud/start'
import { cloudSettings } from '../config'

export type ManagementStatus = {
  /** The Fleet Console this machine answers; null when it answers none. */
  managedBy: null | {
    fingerprint: string; hqAddress: string; local: boolean; connected: boolean; since: string
    /** hq said it moves, and the new address has not passed this machine's check yet (spec §13). */
    moving: HqMove | null
  }
  /**
   * The Fleet Console running on this machine; null when none does. `hq`: whether HQ lets it in, as it says itself;
   * null while it is not running or does not answer.
   */
  consoleHere: null | { address: string; version: string; onHqMachine: boolean; containers: PartState; hq: HqReach | null }
  /** The Fleet Console that ran here handed over to one on another machine; null when none did. */
  retiredHere: null | { machineName: string; at: string }
  /**
   * A move this machine was armed to receive: waiting for it, taking it in, or — while nothing else runs here — one
   * that ended before it came, and why (`ended`). Null otherwise.
   */
  receiving?: null | { kind: 'hq' | 'site'; siteName: string; from: string; waiting: boolean; ended?: string }
  /** Agenthix Cloud's controller: enrolled, or why not yet; absent on a machine not set up for Cloud. */
  cloud?: CloudStatus | null
}

export async function linkStatus(ctx: Context): Promise<ManagementStatus> {
  const pin = readPin(ctx.state)
  const here = consoleHere(ctx)
  const containers = here && partState(await ctx.docker.composePs(here.project, here.file).catch(() => []), 1)
  const hq = containers === 'running' ? (await consoleHereSays(ctx, 10_000))?.hq ?? null : null
  return {
    managedBy: pin && {
      fingerprint: formatFingerprint(pin.consoleFingerprint), hqAddress: pin.hqAddress, local: pin.local,
      connected: ctx.link?.connected() ?? false, since: pin.pinnedAt, moving: readMove(ctx.state),
    },
    consoleHere: here && {
      address: CONSOLE_ADDRESS, version: here.settings.version, onHqMachine: here.settings.onHqMachine,
      containers: containers as PartState, hq,
    },
    retiredHere: here ? null : retiredHere(ctx.state),
    receiving: receivingNow(ctx),
    cloud: await cloudStatus(ctx.state, cloudSettings()),
  }
}

function receivingNow(ctx: Context): ManagementStatus['receiving'] {
  const r = readReceive(ctx.state)
  if (!r || r.phase === 'committed') return null
  const { hq, site } = installed(ctx)
  if (r.phase === 'failed' && (hq || site)) return null
  const move = { kind: r.target === 'hq' ? 'hq' as const : 'site' as const, siteName: r.siteName, from: r.peerName, waiting: r.phase === 'waiting' }
  return r.phase === 'failed' ? { ...move, ended: r.reason ?? 'the move ended before it began.' } : move
}
