/**
 * The live half of hq's relay (host-management spec §4 C3, C8): which host services and which Fleet Console are
 * connected now, and where an envelope goes. In memory, like the site channel's registry; what may connect is the
 * database's (hosts.ts, joins.ts).
 *
 * hq passes an envelope only between a host service and the Fleet Console it pinned when it joined: a host's envelope
 * must come from its own fingerprint and go to its console's, and the console's must go to a host it accepted, from
 * the fingerprint that host pinned. Anything else is answered `relay.undeliverable`, never passed on.
 */
import type { WebSocket } from 'ws'
import type {
  HostEnvelope, HostIdentity, JoinRestoreClaim, ConsoleHandoverAcceptance, ConsoleHandoverAsk, ConsoleHandoverCertificate, RelayUndeliverableReason,
} from '@agenthix/core'
import { frame, send } from './frames'
import { TransferRoutes } from './transfers'

/** A host service as the relay knows it: what it authenticated as. */
export type RelayPeer = { hostId: string; fingerprint: string; consoleFingerprint: string }

export type JoinRequestPayload = { joinId: string; identity: HostIdentity; machineName: string; runsHq?: true; restores?: JoinRestoreClaim; binding: string }

type LiveHost = RelayPeer & { ws: WebSocket; since: Date }
type Joining = { ws: WebSocket; request: JoinRequestPayload | null; promote(peer: RelayPeer): void }
/** A new Fleet Console waiting for the running one to hand over to it. */
type Handing = { ws: WebSocket; ask: ConsoleHandoverAsk | null; passed: boolean; promote(): void }

export interface RelayHubDeps {
  /** A host hq accepted and has not disconnected, online or not. */
  knownHost(fingerprint: string): Promise<RelayPeer | null>
  now?(): Date
}

export const CLOSE_REPLACED = 4000
export const CLOSE_RETIRED = 4001
export const CLOSE_JOIN_ENDED = 4002
export const CLOSE_REVOKED = 4003
export const CLOSE_HANDOVER_ENDED = 4004

export class RelayHub {
  private readonly hosts = new Map<string, LiveHost>()
  private readonly byFingerprint = new Map<string, string>()
  private readonly joins = new Map<string, Joining>()
  private readonly handovers = new Map<string, Handing>()
  private console: WebSocket | null = null
  /** A site's move, passed between two host services (transfers.ts). */
  readonly transfers: TransferRoutes

  constructor(private readonly deps: RelayHubDeps) {
    this.transfers = new TransferRoutes(hostId => {
      const live = this.hosts.get(hostId)
      return live ? { ws: live.ws, fingerprint: live.fingerprint } : null
    }, () => this.now().getTime())
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  // ── host services ──

  addHost(peer: RelayPeer, ws: WebSocket): void {
    const before = this.hosts.get(peer.hostId)
    if (before && before.ws !== ws) before.ws.close(CLOSE_REPLACED, 'Replaced by a newer connection')
    const since = this.now()
    this.hosts.set(peer.hostId, { ...peer, ws, since })
    this.byFingerprint.set(peer.fingerprint, peer.hostId)
    this.presence(peer, true, since)
  }

  /** Only the connection that is current: a replaced one closing must not take its successor's place. */
  removeHost(hostId: string, ws: WebSocket): void {
    const live = this.hosts.get(hostId)
    if (!live || live.ws !== ws) return
    this.forget(live)
  }

  /** The machine was disconnected: told so, and its link closed at once. */
  revokeHost(hostId: string): boolean {
    const live = this.hosts.get(hostId)
    if (!live) return false
    send(live.ws, frame('revoke', {}))
    live.ws.close(CLOSE_REVOKED, 'Disconnected')
    this.forget(live)
    return true
  }

  isHostOnline(hostId: string): boolean {
    return this.hosts.has(hostId)
  }

  onlineSince(hostId: string): Date | null {
    return this.hosts.get(hostId)?.since ?? null
  }

  private forget(live: LiveHost): void {
    this.hosts.delete(live.hostId)
    if (this.byFingerprint.get(live.fingerprint) === live.hostId) this.byFingerprint.delete(live.fingerprint)
    this.transfers.hostLeft(live.hostId)
    this.presence(live, false, this.now())
  }

  private presence(peer: RelayPeer, online: boolean, since: Date): void {
    if (this.console) {
      send(this.console, frame('host.presence', { hostId: peer.hostId, fingerprint: peer.fingerprint, online, since: since.toISOString() }))
    }
  }

  // ── the Fleet Console ──

  /** One console link at a time: a newer one replaces the one before. Joins waiting on it are passed to it. */
  setConsole(ws: WebSocket): void {
    if (this.console && this.console !== ws) this.console.close(CLOSE_REPLACED, 'Replaced by a newer connection')
    this.console = ws
    for (const joining of this.joins.values()) {
      if (joining.request) send(ws, frame('join.request', joining.request))
    }
    for (const [handoverId, h] of this.handovers) {
      if (h.ask && !h.passed) send(ws, frame('console.handoverRequest', { handoverId, ask: h.ask }))
    }
  }

  removeConsole(ws: WebSocket): void {
    if (this.console === ws) this.console = null
  }

  /** Its credential was retired: a Fleet Console elsewhere redeemed a code. */
  retireConsole(): void {
    this.console?.close(CLOSE_RETIRED, 'Retired: another Fleet Console took its place')
    this.console = null
  }

  isConsoleConnected(): boolean {
    return this.console !== null
  }

  // ── machines joining ──

  addJoining(joinId: string, ws: WebSocket, promote: (peer: RelayPeer) => void): void {
    this.joins.set(joinId, { ws, request: null, promote })
  }

  removeJoining(joinId: string, ws: WebSocket): void {
    if (this.joins.get(joinId)?.ws === ws) this.joins.delete(joinId)
  }

  isJoining(joinId: string): boolean {
    return this.joins.has(joinId)
  }

  /** The machine's half of the join, for the fleet admin to confirm; held until a console is connected. */
  setJoinRequest(request: JoinRequestPayload): void {
    const joining = this.joins.get(request.joinId)
    if (!joining) return
    joining.request = request
    if (this.console) send(this.console, frame('join.request', request))
  }

  /** Sends `host.joined` on the joining connection, which carries on as the host's link. False if it is gone. */
  completeJoin(joinId: string, joined: { hostId: string; machineCredential: string; acceptance: unknown }, peer: RelayPeer): boolean {
    const joining = this.joins.get(joinId)
    if (!joining || !send(joining.ws, frame('host.joined', joined))) return false
    this.joins.delete(joinId)
    joining.promote(peer)
    return true
  }

  endJoin(joinId: string, reason: 'refused' | 'expired' | 'used'): boolean {
    const joining = this.joins.get(joinId)
    if (!joining) return false
    this.joins.delete(joinId)
    send(joining.ws, frame('host.joinRefused', { reason }))
    joining.ws.close(CLOSE_JOIN_ENDED, 'Join ended')
    return true
  }

  /**
   * The join is no more without anyone having refused it — the Fleet Console that opened it started anew and no longer
   * holds its code: the machine is let go with no refusal, and says HQ no longer holds its code. False if it is gone.
   */
  dropJoin(joinId: string): boolean {
    const joining = this.joins.get(joinId)
    if (!joining) return false
    this.joins.delete(joinId)
    joining.ws.close(CLOSE_JOIN_ENDED, 'Join ended')
    return true
  }

  // ── the Fleet Console moving (core's join.ts) ──

  addHandover(handoverId: string, ws: WebSocket, promote: () => void): void {
    this.handovers.set(handoverId, { ws, ask: null, passed: false, promote })
  }

  removeHandover(handoverId: string, ws: WebSocket): void {
    if (this.handovers.get(handoverId)?.ws === ws) this.handovers.delete(handoverId)
  }

  /** The new Fleet Console's half, for the running one to check; held until one is connected. */
  setHandoverAsk(handoverId: string, ask: ConsoleHandoverAsk): void {
    const h = this.handovers.get(handoverId)
    if (!h) return
    h.ask = ask
    if (this.console) send(this.console, frame('console.handoverRequest', { handoverId, ask }))
  }

  /** The running Fleet Console's answer, to the new one. False when the new one is gone. */
  passHandover(handoverId: string, acceptance: ConsoleHandoverAcceptance): boolean {
    const h = this.handovers.get(handoverId)
    if (!h || !h.ask || h.passed || !send(h.ws, frame('console.handover', acceptance))) return false
    h.passed = true
    return true
  }

  /** The new Fleet Console's credential, on its handover connection. False when that connection is gone. */
  sendHandoverCredential(handoverId: string, credential: string): boolean {
    const h = this.handovers.get(handoverId)
    return !!h && send(h.ws, frame('console.credential', { credential }))
  }

  /**
   * The move is done: the one before is retired, and every machine that pinned it is routed to the new one and handed
   * the certificate. `ws` is the connection the new one acknowledged on, which becomes the console link; when it came
   * back with its credential instead, its handover connection, if one is still open, is closed.
   */
  finishHandover(handoverId: string, done: { oldFingerprint: string; newFingerprint: string; certificate: ConsoleHandoverCertificate }, ws?: WebSocket): void {
    const h = this.handovers.get(handoverId)
    this.handovers.delete(handoverId)
    this.retireConsole()
    if (h && h.ws === ws) h.promote()
    else h?.ws.close(CLOSE_HANDOVER_ENDED, 'Handover ended')
    for (const live of this.hosts.values()) {
      if (live.consoleFingerprint !== done.oldFingerprint) continue
      live.consoleFingerprint = done.newFingerprint
      send(live.ws, frame('console.handover', { certificates: [done.certificate] }))
    }
  }

  /** Tells the Fleet Console a person lost the fleet admin role, so it ends their sessions at once. */
  tellFleetAdminRemoved(userId: string): boolean {
    return this.console ? send(this.console, frame('fleetAdmin.removed', { userId })) : false
  }

  // ── hq moving to a new address (spec §13) ──

  /** Tells every connected host service and the Fleet Console the address hq moves to; how many were told. */
  tellAddress(address: string): { hosts: number; console: boolean } {
    let hosts = 0
    for (const live of this.hosts.values()) if (send(live.ws, frame('hq.address', { address }))) hosts++
    return { hosts, console: this.console ? send(this.console, frame('hq.address', { address })) : false }
  }

  // ── envelopes ──

  /**
   * From a host service: only to the console it pinned, only as itself. Only from its current connection: one that
   * was replaced or disconnected may still deliver a frame while it closes, and that frame is dropped.
   */
  fromHost(peer: RelayPeer, ws: WebSocket, envelope: HostEnvelope): void {
    const live = this.hosts.get(peer.hostId)
    if (live?.ws !== ws) return
    const refuse = (reason: RelayUndeliverableReason) => this.undeliverable(ws, envelope.id, reason)
    // The live record, not the one it connected with: a move of the Fleet Console changes where it may send.
    if (envelope.from !== live.fingerprint || envelope.to !== live.consoleFingerprint) return refuse('not_allowed')
    if (!this.console) return refuse('recipient_offline')
    send(this.console, frame('relay.envelope', { envelope }))
  }

  /** From the Fleet Console: only to a host it accepted, only from the identity that host pinned. */
  async fromConsole(ws: WebSocket, envelope: HostEnvelope): Promise<void> {
    if (this.console !== ws) return
    const refuse = (reason: RelayUndeliverableReason) => this.undeliverable(ws, envelope.id, reason)
    const hostId = this.byFingerprint.get(envelope.to)
    const live = hostId ? this.hosts.get(hostId) : undefined
    const peer: RelayPeer | null = live ?? await this.deps.knownHost(envelope.to)
    if (!peer) return refuse('unknown_recipient')
    if (envelope.from !== peer.consoleFingerprint) return refuse('not_allowed')
    const current = this.hosts.get(peer.hostId)
    if (!current) return refuse('recipient_offline')
    send(current.ws, frame('relay.envelope', { envelope }))
  }

  undeliverable(ws: WebSocket | undefined, envelopeId: string, reason: RelayUndeliverableReason): void {
    if (ws) send(ws, frame('relay.undeliverable', { envelopeId, reason }))
  }
}
