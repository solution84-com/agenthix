/**
 * Which Fleet Console this machine answers (host-management spec §2, §6): the identity it pinned when it connected,
 * HQ's address it reaches the Fleet Console through, and its machine credential to HQ's relay. One controller at a
 * time, so one record. Read from the state folder on every use, so forgetting it — `console disconnect`, or HQ's
 * `revoke` — takes effect for the very next envelope.
 */
import fs from 'node:fs'
import { isHostIdentity } from '@agenthix/core/host-crypto'
import { isFingerprint, type HostIdentity } from '@agenthix/core'
import type { StateFolder } from '../state/folder'

const FILE = ['link', 'console.json']

export type ConsolePin = {
  console: HostIdentity & { role: 'console' }
  consoleFingerprint: string
  /** HQ's address as the machine admin typed it to connect, or HQ's local listener on HQ's own machine. */
  hqAddress: string
  /** What HQ calls this machine on its relay. */
  hostId: string
  /** The machine credential to HQ's relay. Secret: never printed or logged. */
  machineCredential: string
  pinnedAt: string
  /** On HQ's machine, its own Fleet Console, pinned over the local pairing rather than a fleet admin's code. */
  local: boolean
}

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v)

function parse(value: unknown): ConsolePin | null {
  const v = value as Partial<ConsolePin> | null
  if (!v || !isHostIdentity(v.console) || v.console.role !== 'console' || !isFingerprint(v.consoleFingerprint)) return null
  if (!text(v.hqAddress, 512) || !text(v.hostId, 128) || !text(v.machineCredential, 512) || !text(v.pinnedAt, 64)) return null
  return {
    console: { role: 'console', signingKey: v.console.signingKey, sealingKey: v.console.sealingKey },
    consoleFingerprint: v.consoleFingerprint,
    hqAddress: v.hqAddress,
    hostId: v.hostId,
    machineCredential: v.machineCredential,
    pinnedAt: v.pinnedAt,
    local: v.local === true,
  }
}

/** The pinned Fleet Console; null when there is none. A record that is not one pins nothing. */
export function readPin(state: StateFolder): ConsolePin | null {
  try {
    return parse(state.readJson(...FILE))
  } catch {
    return null
  }
}

export function writePin(state: StateFolder, pin: ConsolePin): void {
  state.writeJson(FILE, pin)
}

/** Forgets the pin and the machine credential with it. */
export function forgetPin(state: StateFolder): void {
  fs.rmSync(state.path(...FILE), { force: true })
}
