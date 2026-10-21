/**
 * A stand-in for Agenthix Cloud's controller, for tests: a `Dial` that answers as Cloud's `/host-link` would, with
 * core's real keys, bindings, envelopes and replay protection. Nothing here reaches a network.
 *
 *   const cloud = await StandInCloud.make({ machineId: 'm-1' })
 *   writeCodeFile(cloud.code)                  // the one-time code, as Cloud's provisioning leaves it on the machine
 *   startCloud({ ..., dial: cloud.dial })      // the host service enrols, then reconnects with its machine id
 *   await cloud.connected()                    // reconnected, and Cloud's first envelope (`hello`) sent
 *   const answer = await cloud.ask({ op: 'figures.read' })
 *
 * Set `refuseJoin` to answer the join with `host.joinRefused`, `answerJoin` to answer it some other way (a wrong
 * binding, say), and `sendHello: false` to send the first frame yourself with `conn.deliver(...)`.
 */
import {
  HOST_ID_HEADER, HOST_JOIN_LOOKUP_HEADER, HOST_PROTOCOL_VERSION, type CloudJoinRequest, type CloudRequest,
  type CloudResult, type HostEnvelope, type HostIdentity, type SealedMessage,
} from '@agenthix/core'
import {
  EnvelopeReplayGuard, cloudJoinBinding, cloudJoinLookup, fingerprintOf, generateHostKeys, generateJoinCode,
  openEnvelope, sealEnvelope, verifyHostCloudJoinBinding, type HostKeys,
} from '@agenthix/core/host-crypto'
import type { Dial, SocketEvents } from '../link/socket'

export type StandInConnection = {
  url: string
  headers: Record<string, string>
  /** Every frame the host service sent on it. */
  sent: { type: string; payload: Record<string, unknown> }[]
  closed: boolean
  /** A frame from Cloud, delivered on the next turn. */
  deliver: (type: string, payload: unknown) => Promise<void>
  /** Cloud closes it. */
  drop: () => void
}

type Waiter = { requestId: string; resolve: (r: CloudResult) => void }

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

export class StandInCloud {
  readonly connections: StandInConnection[] = []
  readonly joins: CloudJoinRequest[] = []
  /** Every message the host service sealed to Cloud, opened. */
  readonly received: Record<string, unknown>[] = []
  /** The host service's identity, learned at its join. */
  host: HostIdentity | null = null
  refuseJoin: 'refused' | 'expired' | 'used' | null = null
  answerJoin: ((join: CloudJoinRequest) => Promise<Record<string, unknown>>) | null = null
  sendHello = true
  private used = false
  private waiters: Waiter[] = []
  private connectedWaiters: ((c: StandInConnection) => void)[] = []
  private readonly replay = new EnvelopeReplayGuard(0)
  private nextId = 0

  private constructor(readonly keys: HostKeys, readonly fingerprint: string, readonly code: string, readonly machineId: string) {}

  static async make(o: { machineId?: string } = {}): Promise<StandInCloud> {
    const keys = await generateHostKeys('cloud')
    return new StandInCloud(keys, await fingerprintOf(keys.identity), generateJoinCode(), o.machineId ?? 'machine-1')
  }

  get identity(): HostIdentity & { role: 'cloud' } {
    return this.keys.identity as HostIdentity & { role: 'cloud' }
  }

  dial: Dial = (url, headers, events: SocketEvents) => {
    const conn: StandInConnection = {
      url, headers, sent: [], closed: false,
      deliver: async (type, payload) => {
        await tick()
        if (!conn.closed) events.message(JSON.stringify({ version: HOST_PROTOCOL_VERSION, type, payload }))
      },
      drop: () => {
        if (conn.closed) return
        conn.closed = true
        events.close()
      },
    }
    this.connections.push(conn)
    void this.accept(conn, events)
    return {
      send: text => {
        const f = JSON.parse(text) as { type: string; payload: Record<string, unknown> }
        conn.sent.push(f)
        void this.heard(conn, f)
      },
      close: () => conn.drop(),
    }
  }

  /** Resolves once the host service is connected with its machine id and Cloud has sent its first envelope. */
  connected(): Promise<StandInConnection> {
    const open = this.reconnection()
    if (open && this.sendHello) return Promise.resolve(open)
    return new Promise(resolve => this.connectedWaiters.push(resolve))
  }

  /** The open connection made with the machine id; null when none. */
  reconnection(): StandInConnection | null {
    return [...this.connections].reverse().find(c => !c.closed && c.headers[HOST_ID_HEADER]) ?? null
  }

  /** An envelope from Cloud to the host service it enrolled. */
  seal(message: SealedMessage, now = Date.now(), lifetimeMs?: number): Promise<HostEnvelope> {
    if (!this.host) throw new Error('No host has enrolled with the stand-in Cloud')
    return sealEnvelope({ sender: this.keys, recipient: this.host, message, now, lifetimeMs })
  }

  /** Asks the host service on the open connection, and resolves with its answer. */
  async ask(request: CloudRequest | Record<string, unknown>, conn = this.reconnection()): Promise<CloudResult> {
    if (!conn) throw new Error('The host service is not connected to the stand-in Cloud')
    const requestId = `r${++this.nextId}`
    const envelope = await this.seal({ kind: 'request', requestId, by: { kind: 'cloud' }, request: request as CloudRequest })
    const answer = new Promise<CloudResult>(resolve => this.waiters.push({ requestId, resolve }))
    await conn.deliver('relay.envelope', { envelope })
    return answer
  }

  private async accept(conn: StandInConnection, events: SocketEvents): Promise<void> {
    await tick()
    const lookup = conn.headers[HOST_JOIN_LOOKUP_HEADER]
    const machineId = conn.headers[HOST_ID_HEADER]
    const ok = lookup ? !this.used && lookup === (await cloudJoinLookup(this.code)) : machineId === this.machineId && !!this.host
    if (!ok) return conn.drop()
    events.open()
    if (machineId && this.sendHello) {
      await conn.deliver('relay.envelope', { envelope: await this.seal({ kind: 'hello' }) })
      for (const w of this.connectedWaiters.splice(0)) w(conn)
    }
  }

  private async heard(conn: StandInConnection, f: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (f.type === 'host.join') return this.join(conn, f.payload as unknown as CloudJoinRequest)
    if (f.type !== 'relay.envelope' || !this.host) return
    const host = this.host
    const hostFp = await fingerprintOf(host)
    const opened = await openEnvelope(f.payload.envelope, { recipient: this.keys, pinned: fp => (fp === hostFp ? host : null), replay: this.replay })
    if (!opened.ok) return
    const message = opened.message as Record<string, unknown>
    this.received.push(message)
    if (message.kind !== 'result') return
    const i = this.waiters.findIndex(w => w.requestId === message.replyTo)
    if (i >= 0) this.waiters.splice(i, 1)[0].resolve(message.result as CloudResult)
  }

  private async join(conn: StandInConnection, join: CloudJoinRequest): Promise<void> {
    this.joins.push(join)
    this.used = true
    const hostFp = await fingerprintOf(join.identity)
    if (this.refuseJoin || !(await verifyHostCloudJoinBinding(this.code, hostFp, join.binding, join.machineId ?? ''))) {
      return conn.deliver('host.joinRefused', { reason: this.refuseJoin ?? 'refused' })
    }
    if (this.answerJoin) return conn.deliver('host.joined', await this.answerJoin(join))
    this.host = join.identity
    await conn.deliver('host.joined', {
      machineId: this.machineId,
      acceptance: { identity: this.identity, binding: await cloudJoinBinding(this.code, this.fingerprint, hostFp, this.machineId) },
    })
  }
}
