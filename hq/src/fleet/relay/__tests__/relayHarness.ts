/**
 * A real http server with both links attached, a real hub, and real WebSocket clients. Only what needs a database is
 * a stand-in: which credentials and lookups are good, and what a console request answers.
 */
import http from 'node:http'
import type net from 'node:net'
import WebSocket from 'ws'
import {
  HOST_PROTOCOL_VERSION, HQ_HOST_LINK_PATH, HQ_CONSOLE_LINK_PATH, type ConsoleHandoverCertificate, type RelayFrame,
} from '@agenthix/core'
import type { CompletedHandover } from '../../handover'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { RelayHub, type RelayPeer } from '../relayHub'
import { attachHostLink, type JoinClaim } from '../hostLinkServer'
import { attachConsoleLink, type ConsoleAnswer } from '../consoleLinkServer'

export type Harness = {
  port: number
  hub: RelayHub
  /** credential → peer */
  hosts: Map<string, RelayPeer>
  /** lookup → claim */
  joins: Map<string, JoinClaim>
  recorded: { joinId: string; fingerprint: string; machineName: string }[]
  consoleSecret: string
  codes: Map<string, string>
  /** handover lookup → the handover it opens */
  handovers: Map<string, { handoverId: string; expiresAt: Date }>
  asks: { handoverId: string; fingerprint: string }[]
  issueHandoverCredential: (handoverId: string, certificate: unknown) => Promise<string | null>
  completeHandover: (handoverId: string) => Promise<CompletedHandover | null>
  completeHandoverWithCredential: (presented: string) => Promise<(CompletedHandover & { handoverId: string }) | null>
  certificates: ConsoleHandoverCertificate[]
  answer: (method: string, params: unknown) => Promise<ConsoleAnswer>
  /** A Fleet Console said it has just started: the joins open before `at` end (joins.ts in hq). */
  consoleStarted: (at: Date) => Promise<void>
  starts: Date[]
  close(): Promise<void>
}

export async function startHarness(): Promise<Harness> {
  const server = http.createServer((_req, res) => res.end('ok'))
  const sockets = new Set<net.Socket>()
  server.on('connection', s => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  const hosts = new Map<string, RelayPeer>()
  const harness = {
    hosts,
    joins: new Map<string, JoinClaim>(),
    recorded: [] as Harness['recorded'],
    consoleSecret: 's'.repeat(40),
    codes: new Map<string, string>(),
    handovers: new Map(),
    asks: [],
    issueHandoverCredential: async () => null,
    completeHandover: async () => null,
    completeHandoverWithCredential: async () => null,
    certificates: [],
    answer: async (): Promise<ConsoleAnswer> => ({ ok: true, result: {} }),
    starts: [],
  } as unknown as Harness
  harness.consoleStarted = async at => { harness.starts.push(at) }
  const hub = new RelayHub({ knownHost: async fp => [...hosts.values()].find(p => p.fingerprint === fp) ?? null })
  harness.hub = hub

  attachHostLink(server, {
    hub,
    authenticateHost: async credential => hosts.get(credential) ?? null,
    claimJoin: async lookup => {
      const claim = harness.joins.get(lookup) ?? null
      // Works once, as the database's claim does.
      if (claim?.ok) harness.joins.set(lookup, { ok: false, reason: 'used' })
      return claim
    },
    recordJoinRequest: async (joinId, r) => {
      harness.recorded.push({ joinId, fingerprint: r.fingerprint, machineName: r.machineName })
      return true
    },
    fingerprintOf,
    handoverCertificates: async () => harness.certificates,
  })
  attachConsoleLink(server, {
    hub,
    authenticateConsole: async presented => presented === harness.consoleSecret,
    redeemConsoleCode: async code => {
      const credential = harness.codes.get(code) ?? null
      harness.codes.delete(code)
      return credential
    },
    claimHandover: async lookup => {
      const claim = harness.handovers.get(lookup) ?? null
      harness.handovers.delete(lookup)
      return claim
    },
    recordHandoverAsk: async (handoverId, identity) => {
      const fingerprint = await fingerprintOf(identity)
      harness.asks.push({ handoverId, fingerprint })
      return fingerprint
    },
    issueHandoverCredential: (handoverId, certificate) => harness.issueHandoverCredential(handoverId, certificate),
    completeHandover: handoverId => harness.completeHandover(handoverId),
    completeHandoverWithCredential: presented => harness.completeHandoverWithCredential(presented),
    handleRequest: (method, params) => harness.answer(method, params),
    consoleStarted: at => harness.consoleStarted(at),
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  harness.port = (server.address() as { port: number }).port
  harness.close = async () => {
    for (const s of sockets) s.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  return harness
}

/** A client that records every frame it receives, from the moment it opens. */
export type Client = { ws: WebSocket; frames: RelayFrame[]; next(type: string, timeoutMs?: number): Promise<RelayFrame>; closed: Promise<number> }

export function dial(h: Harness, path: string, headers: Record<string, string>): Client {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}${path}`, { headers })
  const frames: RelayFrame[] = []
  const waiting: { type: string; resolve(f: RelayFrame): void }[] = []
  ws.on('message', raw => {
    const f = JSON.parse(raw.toString()) as RelayFrame
    frames.push(f)
    for (const w of [...waiting]) if (w.type === f.type) {
      waiting.splice(waiting.indexOf(w), 1)
      w.resolve(f)
    }
  })
  const closed = new Promise<number>(resolve => ws.on('close', code => resolve(code)))
  ws.on('error', () => {})
  return {
    ws, frames, closed,
    next: (type, timeoutMs = 2000) => {
      const seen = frames.find(f => f.type === type)
      if (seen) {
        frames.splice(frames.indexOf(seen), 1)
        return Promise.resolve(seen)
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${type} frame`)), timeoutMs)
        waiting.push({ type, resolve: f => { clearTimeout(timer); frames.splice(frames.indexOf(f), 1); resolve(f) } })
      })
    },
  }
}

export const opened = (c: Client) => new Promise<void>((resolve, reject) => {
  c.ws.once('open', () => resolve())
  c.ws.once('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)))
})

/** The HTTP status an upgrade is refused with. */
export const refusedWith = (c: Client) => new Promise<number>((resolve, reject) => {
  c.ws.once('open', () => reject(new Error('it was accepted')))
  c.ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
})

export function sendFrame(c: Client, type: string, payload: unknown, extra: Record<string, string> = {}): void {
  c.ws.send(JSON.stringify({ version: HOST_PROTOCOL_VERSION, type, payload, ...extra }))
}

export const hostLink = (h: Harness, headers: Record<string, string>) => dial(h, HQ_HOST_LINK_PATH, headers)
export const consoleLink = (h: Harness, headers: Record<string, string>) => dial(h, HQ_CONSOLE_LINK_PATH, headers)
