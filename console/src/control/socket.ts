/**
 * The console's control socket: the machine admin's way in, as the host service's owner socket is its own. A Unix
 * socket in the state folder, readable and writable by the console's user only, so only `docker exec` into the
 * console's container reaches it — the host service, on the machine's authority. Never a network port.
 *
 * Its commands (`node dist/cli.js <command>`), one JSON line in, one JSON line out:
 *
 * - `local-join`: a one-time code for hq's own machine at install, whose join confirms itself (join/joins.ts);
 * - `handover-code`: a one-time code to move this Fleet Console to another machine (handover/outgoing.ts);
 * - `handover-status`: whether this Fleet Console took the place of another, how many machines follow it
 *   (handover/incoming.ts), the key it holds, and whether HQ lets it in (`hq`, hqReach.ts);
 * - `hq-address <address>`: hq moved there; the Fleet Console dials it once it passes the move check
 *   (hq/addressFollow.ts), answering `{ address, outcome }`;
 * - `remote-csr`, `remote-on`, `remote-off`, `remote-status` and `remote-authenticator-add`, with their request as
 *   `payload`: remote access on a machine Agenthix Cloud runs (net/remoteAccess.ts), which the host service asks only
 *   for Cloud's pinned controller on a machine enrolled with Cloud. The payload can hold an authenticator's secret, so
 *   it comes on the command line's standard input, never in its arguments.
 * - `remote-authenticator-reset`, with `{ userId }`: forgets that fleet admin's authenticator and its recovery codes,
 *   so they set up one again (`agenthix console reset-code`, on the machine's authority, which reads the id from hq).
 */
import fs from 'node:fs'
import net from 'node:net'
import { checkRemoteAuthenticator } from '@agenthix/core'
import type { Joins } from '../join/joins'
import type { HandoverIn } from '../handover/incoming'
import type { HandoverOut } from '../handover/outgoing'
import type { ConsoleAddressFollower } from '../hq/addressFollow'
import type { HqLink } from '../hq/link'
import type { Authenticators } from '../auth/authenticators'
import type { RemoteAccess } from '../net/remoteAccess'
import type { HqFeatures } from '../hq/hqFeatures'
import { watchHqReach, type HqReach } from './hqReach'

/** How long the code for hq's own machine works: the install uses it at once. */
export const LOCAL_JOIN_TTL_MS = 10 * 60_000
// A certificate chain for remote access is the largest request.
const MAX_REQUEST_BYTES = 64 * 1024
const IDLE_MS = 15_000

export type ControlRequest = { command: string; address?: string; payload?: Record<string, unknown> }
export type ControlAnswer = ({ ok: true } & Record<string, unknown>) | { ok: false; error: string }

export type ControlDeps = {
  joins: Joins; handoverOut: HandoverOut; handoverIn: HandoverIn; link: HqLink; hqAddress?: ConsoleAddressFollower
  remoteAccess?: RemoteAccess; authenticators?: Authenticators
  /** Which flagged features hq says are on: remote access is Agenthix Cloud's (adr-0189). */
  features?: HqFeatures
}

type Served = ControlDeps & { hqReach: () => HqReach }

const COMMANDS: Record<string, (d: Served, r: Partial<ControlRequest>) => Promise<object>> = {
  'local-join': d => d.joins.openLocal(LOCAL_JOIN_TTL_MS),
  'handover-code': d => d.handoverOut.openCode(),
  'handover-status': async d => ({ ...d.handoverIn.status(), hq: d.hqReach() }),
  'hq-address': async (d, r) => {
    if (!d.hqAddress || typeof r.address !== 'string' || r.address.length > 512) throw new Error('Usage: hq-address <address>')
    return (await d.hqAddress.point(r.address)) ?? {}
  },
  'remote-csr': async (d, r) => (await cloudOn(d)).csr(payload(r).name),
  'remote-on': async (d, r) => (await cloudOn(d)).on(payload(r)),
  'remote-off': d => remote(d).off(),
  'remote-status': async d => remote(d).status(),
  'remote-authenticator-add': async (d, r) => {
    await cloudOn(d)
    if (!d.authenticators) throw new Error('This Fleet Console does not keep authenticator codes.')
    const checked = checkRemoteAuthenticator(payload(r), new Date())
    if (!checked.ok) throw new Error(checked.message)
    return d.authenticators.add(checked.value)
  },
  'remote-authenticator-reset': async (d, r) => {
    if (!d.authenticators) throw new Error('This Fleet Console does not keep authenticator codes.')
    const { userId } = payload(r)
    if (typeof userId !== 'string' || !userId || userId.length > 64) throw new Error('The request names no fleet admin.')
    return d.authenticators.reset(userId)
  },
}

function remote(d: Served): RemoteAccess {
  if (!d.remoteAccess) throw new Error('This Fleet Console does not do remote access.')
  return d.remoteAccess
}

/**
 * Remote access, for what turns it on or hands over a code: only while hq says Agenthix Cloud is on (adr-0189). Turning
 * it off, its status and forgetting a code stay open, so it can always be closed.
 */
async function cloudOn(d: Served): Promise<RemoteAccess> {
  if (!d.features || !(await d.features.isOn('cloud'))) {
    throw new Error('Remote access is not available: Agenthix Cloud is not on for the organisation. Nothing was changed.')
  }
  return remote(d)
}

function payload(r: Partial<ControlRequest>): Record<string, unknown> {
  const p = r.payload
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('The request carries nothing to act on.')
  return p
}

export async function startControlSocket(socketPath: string, controlDeps: ControlDeps): Promise<net.Server> {
  const deps: Served = { ...controlDeps, hqReach: watchHqReach(controlDeps.link) }
  // A socket left by an earlier run would stop the listen; nothing else lives at this path.
  fs.rmSync(socketPath, { force: true })
  const server = net.createServer(socket => {
    socket.setTimeout(IDLE_MS, () => socket.destroy())
    let buffered = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffered += chunk
      if (buffered.length > MAX_REQUEST_BYTES) return socket.destroy()
      const end = buffered.indexOf('\n')
      if (end < 0) return
      socket.removeAllListeners('data')
      answer(buffered.slice(0, end), deps).then(a => socket.end(`${JSON.stringify(a)}\n`))
    })
    socket.on('error', () => {})
  })
  const previous = process.umask(0o177)
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    })
  } finally {
    process.umask(previous)
  }
  fs.chmodSync(socketPath, 0o600)
  return server
}

async function answer(line: string, deps: Served): Promise<ControlAnswer> {
  let request: Partial<ControlRequest>
  try {
    request = JSON.parse(line) as Partial<ControlRequest>
  } catch {
    return { ok: false, error: 'The request is not JSON.' }
  }
  const command = typeof request.command === 'string' && Object.hasOwn(COMMANDS, request.command) ? COMMANDS[request.command] : null
  if (!command) return { ok: false, error: `unknown command: ${String(request.command)}` }
  try {
    return { ok: true, ...(await command(deps, request)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'That could not be done.' }
  }
}
