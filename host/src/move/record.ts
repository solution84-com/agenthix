/**
 * Where each side of a site's move stands, written down before each step that the other side may act on, so a
 * restart of the host service in the middle never makes it guess: the old machine never starts its site again once
 * it committed, and the new machine never keeps running a site it was not told is its own.
 */
import type { HostIdentity } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import { installed, type Context } from '../service/context'

/** What a move of hq changes about the pin, so giving up puts it back: where the link dials, and whether it is local. */
export type PinBefore = { hqAddress: string; local: boolean }

/** The fields only a move of hq with its default site has (hqSend.ts, hqReceive.ts); absent on a site's move. */
export type HqMoveFields = {
  target?: 'hq' | 'site'
  /** The address hq answers at once it runs on the new machine. */
  hqAddress?: string
  /** The address it answered at before, to tell those told the new one that it stays. */
  previousAddress?: string
  pinBefore?: PinBefore | null
  /** Whether the Fleet Console ran beside hq on the old machine, and so is restored with it on the new one. */
  consoleWithHq?: boolean
  /** The other machine's name, for what people read. */
  peerName?: string
  /** When the old machine's admin started hq here again after a move that ended on neither machine (ISO). */
  recoveredAt?: string
}

export type SendPhase =
  /** The site is stopped for the final backup; nothing has left the machine. */
  | 'stopped'
  | 'transferring'
  /** The new machine has the backup restored; the site's credential went to it at `releasedAt`. */
  | 'released'
  /** The new machine took over: this machine never starts the site again. */
  | 'committed'
  | 'rolledBack'
  /** The copy kept here was removed, the move's last step. */
  | 'removed'

export type SendRecord = {
  transferId: string
  peer: string
  peerIdentity: HostIdentity
  phase: SendPhase
  /** When the site's credential went to the new machine (ms); null before. */
  releasedAt: number | null
  /** Past this (ms) without `tookOver`, the site starts here again. */
  deadline: number | null
  reason: string | null
  /**
   * The `installedAt` of the HQ or site that moves. A later install here is not what moved away: an earlier one's
   * finished move guards nothing of it (`sendOf`).
   */
  installedAt?: string
} & HqMoveFields

export type ReceivePhase =
  /** Armed by the Fleet Console: waits for the old machine's first chunk; nothing of the site is here. */
  | 'waiting'
  | 'receiving'
  /** Restored and stopped: the site's databases and workspaces are here, and nothing runs it. */
  | 'restored'
  /** The old machine released the site: it runs here until `deadline`, unless the old machine commits. */
  | 'starting'
  /** The site answered hq from here and `tookOver` went to the old machine. */
  | 'tookOver'
  /** The old machine committed: the site is this machine's. */
  | 'committed'
  /** The move did not complete: nothing of the site is left here. */
  | 'failed'

export type ReceiveRecord = {
  transferId: string
  peer: string
  peerIdentity: HostIdentity
  siteName: string
  /** The machine the site comes from, for what people read. */
  peerName: string
  phase: ReceivePhase
  armedAt: string
  /** When the site must answer hq, and the commit arrive, by (ms); null before it starts. */
  deadline: number | null
  reason: string | null
} & HqMoveFields

const SEND = ['move', 'send.json']
const RECEIVE = ['move', 'receive.json']

export function readSend(state: StateFolder): SendRecord | null {
  return (state.readJson(...SEND) as SendRecord | null) ?? null
}

export function writeSend(state: StateFolder, record: SendRecord): void {
  state.writeJson(SEND, record)
}

/**
 * The move away of the HQ or site installed here now, if one is on record; null when the record is of another target
 * or an earlier install, which it no longer guards. A record that names no install is of none.
 */
export function sendOf(ctx: Context, target: 'hq' | 'site'): SendRecord | null {
  const record = readSend(ctx.state)
  if (!record || (record.target ?? 'site') !== target || !record.installedAt) return null
  return installed(ctx)[target]?.settings.installedAt === record.installedAt ? record : null
}

export function readReceive(state: StateFolder): ReceiveRecord | null {
  return (state.readJson(...RECEIVE) as ReceiveRecord | null) ?? null
}

export function writeReceive(state: StateFolder, record: ReceiveRecord): void {
  state.writeJson(RECEIVE, record)
}

/** The receiving side waits for a site, or is taking one in: nothing else may start a site here meanwhile. */
export function awaitingSite(state: StateFolder): ReceiveRecord | null {
  const r = readReceive(state)
  return r && r.phase !== 'committed' && r.phase !== 'failed' ? r : null
}

/**
 * The Fleet Console ended the move this machine was armed for, before any of it arrived: the machine stops waiting, and
 * says why. Only while it waits — nothing of the site or HQ is here then; once the old machine began, the move's own
 * steps end it. The reason hq's dropping of the transfer gives way to the Fleet Console's own, whichever comes first.
 */
export function endWaiting(state: StateFolder, transferId: string, reason: string): boolean {
  const r = readReceive(state)
  if (!r || r.transferId !== transferId) return false
  if (r.phase !== 'waiting' && !(r.phase === 'failed' && r.reason === TRANSFER_DROPPED)) return false
  writeReceive(state, { ...r, phase: 'failed', deadline: null, reason })
  return true
}

/** Why a waiting machine stopped when hq dropped the transfer and the Fleet Console has not said why (yet). */
export const TRANSFER_DROPPED = 'the Fleet Console ended the move before the other machine began it.'

/** The state folders whose host service is taking a move in now: one at a time per machine. */
export const receiving = new Set<string>()
