/**
 * The Fleet Console moving to another machine (host-management spec §7; core's join.ts), the machine's part. HQ hands
 * every handover certificate it holds to the machine as it connects, and when a move completes. The machine moves its
 * pin only on a certificate signed by the Fleet Console it pins now: HQ cannot make one, and an old one, or one from
 * another Fleet Console, does nothing. It follows at once — the Fleet Console that signed has handed over and is being
 * retired — keeps HQ's address, its host id and its machine credential, and tells the new Fleet Console, sealed.
 *
 * When a Fleet Console runs on this machine and the one that signed may be it, the machine notes the signer, and the
 * background loop (localConsole.ts) removes the container and its keys once it is sure the one here is that signer:
 * on HQ's machine the local pin says so; on any other machine, the Fleet Console here says which key it holds. Then
 * `agenthix status` says where it runs now. Nothing HQ says alone removes it: only a certificate this machine checked.
 */
import fs from 'node:fs'
import type { HostEnvelope } from '@agenthix/core'
import { fingerprintOf, sealEnvelope, verifyHandoverCertificate, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { readPin, writePin } from './pin'

const RETIRING = ['link', 'retiring-console.json']
const RETIRED = ['console', 'retired.json']
/** More certificates than hq ever hands at once; anything past it is not read. */
const MAX_CERTIFICATES = 50

export type Followed = { from: string; to: string; machineName: string }

export type FollowDeps = {
  state: StateFolder
  keys: () => Promise<HostKeys>
  send: (envelope: HostEnvelope) => void
  now: () => Date
  log?: (line: string) => void
}

/** Follows each certificate the pinned Fleet Console signed, in order; ignores every other. */
export async function followHandover(d: FollowDeps, certificates: unknown): Promise<Followed[]> {
  if (!Array.isArray(certificates)) return []
  const keys = await d.keys()
  const own = await fingerprintOf(keys.identity)
  const followed: Followed[] = []
  for (const certificate of certificates.slice(0, MAX_CERTIFICATES)) {
    const pin = readPin(d.state)
    if (!pin) break
    const handed = await verifyHandoverCertificate(certificate, pin.console)
    if (!handed || handed.fingerprint === own) continue
    const at = d.now().toISOString()
    writePin(d.state, { ...pin, console: handed.identity, consoleFingerprint: handed.fingerprint, pinnedAt: at, local: false })
    if (pin.local || consoleInstalledHere(d.state)) {
      // A chain of moves: any signer in it may be the one here, and it runs at the chain's end now.
      const before = retiringHere(d.state)
      d.state.writeJson(RETIRING, {
        from: [...(before?.from ?? []), pin.consoleFingerprint], machineName: handed.machineName, at, local: pin.local || !!before?.local,
      })
    }
    followed.push({ from: pin.consoleFingerprint, to: handed.fingerprint, machineName: handed.machineName })
    d.log?.(`The Fleet Console moved to ${handed.machineName}; this machine follows it now.`)
  }
  const now = readPin(d.state)
  if (followed.length && now) {
    d.send(await sealEnvelope({
      sender: keys, recipient: now.console, message: { kind: 'handedOver', previous: followed[0].from }, now: d.now().getTime(),
    }))
  }
  return followed
}

/**
 * The Fleet Console this machine pinned handed over while one runs here: who signed (`from`, each of a chain), where it
 * runs now, and whether the pin was the local one of HQ's machine, which proves a signer runs here. Kept until it is
 * removed, or found not to be the one here.
 */
export type Retiring = { from: string[]; machineName: string; at: string; local: boolean }

export function retiringHere(state: StateFolder): Retiring | null {
  const place = readPlace(state, RETIRING)
  if (!place) return null
  const v = state.readJson(...RETIRING) as { from?: unknown; local?: unknown }
  const from = Array.isArray(v.from) ? v.from.filter((f): f is string => typeof f === 'string') : []
  return from.length ? { ...place, from, local: v.local === true } : null
}

/** The Fleet Console here is not the one that handed over: nothing is retired. */
export function forgetRetiring(state: StateFolder): void {
  fs.rmSync(state.path(...RETIRING), { force: true })
}

function consoleInstalledHere(state: StateFolder): boolean {
  try {
    return state.readJson('console', 'settings.json') !== null
  } catch {
    return false
  }
}

/** Once removed: where the Fleet Console that ran here went, for `agenthix status`. */
export function retiredHere(state: StateFolder): { machineName: string; at: string } | null {
  return readPlace(state, RETIRED)
}

export function markRetired(state: StateFolder, place: { machineName: string; at: string }): void {
  state.writeJson(RETIRED, place)
  fs.rmSync(state.path(...RETIRING), { force: true })
}

/** A Fleet Console runs here again (installed or brought back): nothing is retired here. */
export function forgetRetired(state: StateFolder): void {
  fs.rmSync(state.path(...RETIRED), { force: true })
  fs.rmSync(state.path(...RETIRING), { force: true })
}

function readPlace(state: StateFolder, file: string[]): { machineName: string; at: string } | null {
  try {
    const v = state.readJson(...file) as { machineName?: unknown; at?: unknown } | null
    return v && typeof v.machineName === 'string' && typeof v.at === 'string' ? { machineName: v.machineName, at: v.at } : null
  } catch {
    return null
  }
}
