/**
 * HQ's relay for tests: a `Dial` that records what the host service sends and lets a test answer as HQ would — or
 * as a takeover of HQ might. A fake Fleet Console makes real keys, bindings and envelopes with core's cryptography.
 */
import { HOST_PROTOCOL_VERSION, type HostIdentity, type HostMessage, type JoinRequest } from '@agenthix/core'
import {
  fingerprintOf, generateHostKeys, consoleJoinBinding, openEnvelope, sealEnvelope, EnvelopeReplayGuard, type HostKeys,
} from '@agenthix/core/host-crypto'
import type { Dial, SocketEvents } from '../socket'

export type Connection = {
  url: string
  headers: Record<string, string>
  sent: Record<string, unknown>[]
  closed: boolean
  /** A frame from HQ, delivered on the next turn. */
  deliver: (type: string, payload: unknown) => Promise<void>
  /** HQ closes it. */
  drop: () => void
}

export class FakeRelay {
  readonly connections: Connection[] = []
  /** HQ does not take the connection: the upgrade is refused. */
  refuse = false
  /** Called with each `host.join` HQ receives. */
  onJoin: (join: JoinRequest, conn: Connection) => void | Promise<void> = () => {}

  dial: Dial = (url, headers, events: SocketEvents) => {
    const conn: Connection = {
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
    setTimeout(() => {
      if (this.refuse) return conn.drop()
      if (!conn.closed) events.open()
    }, 0)
    return {
      send: text => {
        const f = JSON.parse(text) as Record<string, unknown>
        conn.sent.push(f)
        if (f.type === 'host.join') void this.onJoin(f.payload as JoinRequest, conn)
      },
      close: () => conn.drop(),
    }
  }

  get last(): Connection {
    return this.connections[this.connections.length - 1]
  }
}

export const tick = () => new Promise(resolve => setTimeout(resolve, 0))

export class FakeConsole {
  private constructor(readonly keys: HostKeys, readonly fingerprint: string) {}

  static async make(role: 'console' | 'cloud' = 'console'): Promise<FakeConsole> {
    const keys = await generateHostKeys(role)
    return new FakeConsole(keys, await fingerprintOf(keys.identity))
  }

  async acceptance(code: string, host: HostIdentity) {
    return {
      identity: this.keys.identity as HostIdentity & { role: 'console' },
      binding: await consoleJoinBinding(code, this.fingerprint, await fingerprintOf(host)),
    }
  }

  seal(to: HostIdentity, message: HostMessage, now = Date.now(), lifetimeMs?: number) {
    return sealEnvelope({ sender: this.keys, recipient: to, message, now, lifetimeMs })
  }

  /** Opens what the host service sent back, as the Fleet Console would: only from that host. */
  open(data: unknown, host: HostIdentity, now = Date.now()) {
    return openEnvelope(data, {
      recipient: this.keys,
      pinned: async fp => (fp === (await fingerprintOf(host)) ? host : null),
      replay: new EnvelopeReplayGuard(now - 120_000),
      now,
    })
  }
}
