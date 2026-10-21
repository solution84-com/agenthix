/**
 * hq's own move to a new machine, as hq takes part in it (host-management spec §13). hq steers none of it: the Fleet
 * Console signs every request, the two host services seal and sign what passes between them, and these two commands
 * reach hq only through its control socket, from the host service on the machine it runs on.
 *
 * - `read-only on [<machine>]` / `read-only off` / `read-only`: people can read but not change anything, from the
 *   moment the move's backup starts (server/readOnly.ts); off again when the move ends without moving hq.
 * - `transfer-open <transferId> <from fingerprint> <to fingerprint>`: on the new machine, once hq runs there, the
 *   move's last steps between the old machine and the new one pass through this hq, the old one having stopped.
 *   Either may be away for a while as hq changes machines, so the route waits for both rather than closing.
 */
import { prisma } from 'wasp/server'
import { isFingerprint, isTransferId } from '@agenthix/core'
import type { CommandResult } from '../auth/machine/hqMachineCommands'
import { readOnlyNow, readOnlySentence, setReadOnly } from '../server/readOnly'
import type { RelayHub } from './relay/relayHub'

/** How long the last steps of a move may take on the new machine's hq. */
const LAST_STEPS_MS = 60 * 60_000
const MACHINE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,62}$/u

export function readOnlyCommand(args: string[], now = new Date()): CommandResult {
  const [mode, machine] = args
  if (mode === 'on' && (machine === undefined || MACHINE.test(machine)) && args.length <= 2) {
    const r = { to: machine ?? null, since: readOnlyNow()?.since ?? now.toISOString() }
    setReadOnly(r)
    return { ok: true, text: `Read-only. ${readOnlySentence(r)}`, data: { readOnly: true, ...r } }
  }
  if (mode === 'off' && args.length === 1) {
    setReadOnly(null)
    return { ok: true, text: 'Writable again.', data: { readOnly: false } }
  }
  if (mode === undefined) {
    const r = readOnlyNow()
    return { ok: true, text: r ? readOnlySentence(r) : 'HQ is writable.', data: r ? { readOnly: true, ...r } : { readOnly: false } }
  }
  return { ok: false, error: 'Usage: read-only [on [<machine>] | off]', code: 'usage' }
}

async function fleetMachine(fingerprint: string): Promise<{ id: string; consoleFingerprint: string } | null> {
  const host = await prisma.relayHost.findUnique({ where: { fingerprint }, select: { id: true, consoleFingerprint: true, disconnectedAt: true } })
  return host && !host.disconnectedAt ? host : null
}

export async function transferOpenCommand(hub: RelayHub, args: string[], now = new Date()): Promise<CommandResult> {
  const [transferId, from, to] = args
  if (args.length !== 3 || !isTransferId(transferId) || !isFingerprint(from) || !isFingerprint(to) || from === to) {
    return { ok: false, error: 'Usage: transfer-open <transferId> <from fingerprint> <to fingerprint>', code: 'usage' }
  }
  const [a, b] = [await fleetMachine(from), await fleetMachine(to)]
  if (!a || !b) return { ok: false, error: 'One of the two machines is not in the fleet.', code: 'not_found' }
  if (a.consoleFingerprint !== b.consoleFingerprint) return { ok: false, error: 'The two machines are not managed by the same Fleet Console.' }
  const opened = hub.transfers.open({ transferId, fromHostId: a.id, toHostId: b.id, expiresAt: new Date(now.getTime() + LAST_STEPS_MS), waitForEnds: true })
  return { ok: true, text: opened ? 'Open.' : 'Not opened: that transfer was used already.', data: { opened } }
}

/** The control socket's `transfer-open`, on hq's own relay. */
export async function transferOpenOnRelay(args: string[]): Promise<CommandResult> {
  const { relayHub } = await import('./index')
  return transferOpenCommand(relayHub, args)
}
