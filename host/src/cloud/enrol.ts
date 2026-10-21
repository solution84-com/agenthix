/**
 * This machine's half of enrolling with Agenthix Cloud (pre-release spec B2; core's join.ts): the host service dials
 * Cloud's `/host-link` itself with the lookup derived from the one-time code, sends `host.join`, and pins Cloud's
 * identity only when Cloud's binding — over both fingerprints and the machine id, under the same code and the `cloud`
 * role's label — checks out. Nothing is kept here: the caller pins, and spends the code whatever the outcome.
 */
import {
  CLOUD_MACHINE_ID, HOST_JOIN_LOOKUP_HEADER, HOST_PROTOCOL_VERSION, HOST_PROTOCOL_VERSION_HEADER,
  parseCloudJoinAcceptance, type CloudControllerBinding, type CloudJoinRequest,
} from '@agenthix/core'
import { fingerprintOf, hostCloudJoinBinding, verifyCloudJoinBinding, type HostKeys } from '@agenthix/core/host-crypto'
import { frame, parseFrame } from '../link/frames'
import { hostLinkUrl, type Dial } from '../link/socket'

export type EnrolFailure =
  /** The connection never opened: Cloud did not take it, or could not be reached. Nothing of the code was sent but its lookup. */
  | 'notAccepted'
  | 'refused'
  | 'expired'
  | 'used'
  /** Cloud's answer did not prove it holds the code, or named another machine. */
  | 'badBinding'
  | 'malformed'
  | 'closed'

export type EnrolOutcome = { ok: true; binding: CloudControllerBinding } | { ok: false; reason: EnrolFailure }

export type EnrolOptions = {
  cloudUrl: string
  code: string
  lookup: string
  /** From the start-up settings; Cloud must answer with the same one when it is given. */
  machineId: string | null
  keys: HostKeys
  machineName: string
  dial: Dial
  now: () => Date
  /** How long to wait for Cloud's answer: until the code expires. */
  timeoutMs: number
}

async function accepted(o: EnrolOptions, hostFp: string, p: Record<string, unknown>): Promise<EnrolOutcome> {
  const acceptance = parseCloudJoinAcceptance(p.acceptance)
  const machineId = p.machineId
  if (!acceptance || typeof machineId !== 'string' || !CLOUD_MACHINE_ID.test(machineId)) return { ok: false, reason: 'malformed' }
  if (o.machineId && machineId !== o.machineId) return { ok: false, reason: 'badBinding' }
  const cloudFp = await fingerprintOf(acceptance.identity)
  if (cloudFp === hostFp || !(await verifyCloudJoinBinding(o.code, cloudFp, hostFp, machineId, acceptance.binding))) {
    return { ok: false, reason: 'badBinding' }
  }
  return { ok: true, binding: { identity: acceptance.identity, machineId, pinnedAt: o.now().toISOString() } }
}

export async function enrolWithCloud(o: EnrolOptions): Promise<EnrolOutcome> {
  const hostFp = await fingerprintOf(o.keys.identity)
  const request: CloudJoinRequest = {
    lookup: o.lookup,
    identity: { role: 'host', signingKey: o.keys.identity.signingKey, sealingKey: o.keys.identity.sealingKey },
    machineName: o.machineName,
    ...(o.machineId ? { machineId: o.machineId } : {}),
    binding: await hostCloudJoinBinding(o.code, hostFp, o.machineId ?? ''),
  }
  return new Promise<EnrolOutcome>(resolve => {
    let opened = false
    let settled = false
    let working: Promise<void> = Promise.resolve()
    const finish = (outcome: EnrolOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      resolve(outcome)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: 'expired' }), Math.max(0, o.timeoutMs))
    const headers = { [HOST_PROTOCOL_VERSION_HEADER]: HOST_PROTOCOL_VERSION, [HOST_JOIN_LOOKUP_HEADER]: o.lookup }
    const socket = o.dial(hostLinkUrl(o.cloudUrl), headers, {
      open: () => {
        opened = true
        socket.send(frame('host.join', request))
      },
      message: text => {
        const f = parseFrame(text)
        if (!f || settled) return
        if (f.type === 'ping') socket.send(frame('pong', {}))
        else if (f.type === 'host.joinRefused') {
          const r = f.payload.reason
          finish({ ok: false, reason: r === 'expired' || r === 'used' ? r : 'refused' })
        } else if (f.type === 'host.joined') {
          working = working.then(async () => finish(await accepted(o, hostFp, f.payload)))
        }
      },
      close: () => {
        void working.then(() => finish({ ok: false, reason: opened ? 'closed' : 'notAccepted' }))
      },
    })
  })
}
