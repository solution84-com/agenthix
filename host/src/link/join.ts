/**
 * This machine's half of connecting to a Fleet Console (host-management spec §6; core's join.ts). The code never
 * leaves the machine: HQ is shown only the lookup derived from it, and the machine proves it holds the code with a
 * binding over its own fingerprint. The Fleet Console's answer is pinned only when its binding — over both
 * fingerprints, under the same code — checks out, so HQ, which relays the join, cannot put its own key in the
 * Fleet Console's place. Nothing is kept here: the caller stores the pin, and only on success.
 */
import {
  HOST_JOIN_LOOKUP_HEADER, JOIN_CODE_TTL_MS, MACHINE_RELAY_CREDENTIAL_PREFIX, normalizeJoinCode, type JoinRequest, type JoinRestoreClaim,
} from '@agenthix/core'
import {
  fingerprintOf, hostJoinBinding, isHostIdentity, joinLookup, verifyConsoleJoinBinding, type HostKeys,
} from '@agenthix/core/host-crypto'
import { frame, parseFrame } from './frames'
import type { ConsolePin } from './pin'
import { hostLinkUrl, type Dial } from './socket'

export type JoinFailure =
  /** HQ never opened the connection: the code is unknown to it, used, or expired — or HQ is not there. */
  | 'notAccepted'
  | 'refused'
  | 'expired'
  | 'used'
  /** The answer did not prove it came from whoever holds the code. */
  | 'badBinding'
  | 'malformed'
  /** The connection closed before anyone confirmed. */
  | 'closed'
  /** The machine admin stopped it. */
  | 'aborted'

export type JoinOutcome = { ok: true; pin: Omit<ConsolePin, 'local'> } | { ok: false; reason: JoinFailure }

export type JoinOptions = {
  address: string
  code: string
  keys: HostKeys
  machineName: string
  dial: Dial
  now: () => Date
  /** Told once the join is with HQ, for the fingerprint to be read out. */
  onWaiting?: (hostFingerprint: string) => void
  signal?: AbortSignal
  /** How long to wait for a fleet admin; a little over the code's own hour by default. */
  timeoutMs?: number
  /** How long HQ may go without a word (it pings every 30 s) before the join is taken as lost. */
  quietMs?: number
  /** "This machine runs HQ", under the binding (core's join.ts): set only by the host service that runs hq here. */
  runsHq?: boolean
  /** The backup this machine restores a lost site from, under the binding (adr-0119): set only with a code for restoring. */
  restores?: JoinRestoreClaim
}

/** Three of HQ's pings missed. */
const QUIET_MS = 90_000

const TEXT = /^[\x21-\x7e]+$/

function credentialOk(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 16 && v.length <= 512 && TEXT.test(v) && v.startsWith(MACHINE_RELAY_CREDENTIAL_PREFIX)
}

async function accepted(code: string, hostFp: string, address: string, now: Date, p: Record<string, unknown>): Promise<JoinOutcome> {
  const acceptance = p.acceptance as { identity?: unknown; binding?: unknown } | undefined
  const hostId = p.hostId
  if (!acceptance || !isHostIdentity(acceptance.identity) || acceptance.identity.role !== 'console' ||
    typeof acceptance.binding !== 'string' || typeof hostId !== 'string' || !hostId || hostId.length > 128 || !TEXT.test(hostId) ||
    !credentialOk(p.machineCredential)) {
    return { ok: false, reason: 'malformed' }
  }
  const fleetConsole = { role: 'console' as const, signingKey: acceptance.identity.signingKey, sealingKey: acceptance.identity.sealingKey }
  const consoleFingerprint = await fingerprintOf(fleetConsole)
  if (consoleFingerprint === hostFp || !(await verifyConsoleJoinBinding(code, consoleFingerprint, hostFp, acceptance.binding))) {
    return { ok: false, reason: 'badBinding' }
  }
  return {
    ok: true,
    pin: { console: fleetConsole, consoleFingerprint, hqAddress: address, hostId, machineCredential: p.machineCredential, pinnedAt: now.toISOString() },
  }
}

export async function joinConsole(o: JoinOptions): Promise<JoinOutcome> {
  const code = normalizeJoinCode(o.code)
  if (!code) return { ok: false, reason: 'malformed' }
  const hostFp = await fingerprintOf(o.keys.identity)
  const claims = { ...(o.runsHq ? { runsHq: true as const } : {}), ...(o.restores ? { restores: o.restores } : {}) }
  const request: JoinRequest = {
    lookup: await joinLookup(code),
    identity: { role: 'host', signingKey: o.keys.identity.signingKey, sealingKey: o.keys.identity.sealingKey },
    machineName: o.machineName,
    ...claims,
    binding: await hostJoinBinding(code, hostFp, claims),
  }
  if (o.signal?.aborted) return { ok: false, reason: 'aborted' }

  return new Promise<JoinOutcome>(resolve => {
    let opened = false
    let settled = false
    let working: Promise<void> = Promise.resolve()
    const finish = (outcome: JoinOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(watch)
      o.signal?.removeEventListener('abort', onAbort)
      socket.close()
      resolve(outcome)
    }
    const onAbort = () => finish({ ok: false, reason: 'aborted' })
    const timer = setTimeout(() => finish({ ok: false, reason: 'expired' }), o.timeoutMs ?? JOIN_CODE_TTL_MS + 60_000)
    // HQ pings an open join; a connection that has gone quiet (HQ restarted, a network cut) is a join that is no more.
    const quietMs = o.quietMs ?? QUIET_MS
    let lastHeard = Date.now()
    const watch = setInterval(() => {
      if (Date.now() - lastHeard >= quietMs) finish({ ok: false, reason: 'closed' })
    }, Math.max(1, Math.floor(quietMs / 3)))
    const socket = o.dial(hostLinkUrl(o.address), { [HOST_JOIN_LOOKUP_HEADER]: request.lookup }, {
      open: () => {
        opened = true
        socket.send(frame('host.join', request))
        o.onWaiting?.(hostFp)
      },
      message: text => {
        const f = parseFrame(text)
        if (!f || settled) return
        lastHeard = Date.now()
        if (f.type === 'ping') socket.send(frame('pong', {}))
        else if (f.type === 'host.joinRefused') {
          const r = f.payload.reason
          finish({ ok: false, reason: r === 'expired' || r === 'used' ? r : 'refused' })
        } else if (f.type === 'host.joined') {
          working = working.then(async () => finish(await accepted(code, hostFp, o.address, o.now(), f.payload)))
        }
      },
      close: () => {
        // A `host.joined` being checked as the connection closes is still answered by that check.
        void working.then(() => finish({ ok: false, reason: opened ? 'closed' : 'notAccepted' }))
      },
    })
    o.signal?.addEventListener('abort', onAbort)
  })
}
