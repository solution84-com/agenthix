import type WebSocket from 'ws'
import {
  SITE_PROTOCOL_VERSION,
  parseProtocolVersion,
  type HQConnectionMessage,
  type ChannelRequestPayload,
  type FeatureSwitches,
  type ProtocolVersion,
  type SiteMethodName,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import { PendingRequests, ChannelRequestFailed, DEFAULT_REQUEST_TIMEOUT_MS } from './pendingRequests'
import type { SiteStatusStore } from './siteStatusStore'

export interface SiteConnection {
  siteId: string
  ws: WebSocket
  pending: PendingRequests
  connectedAt: Date
  /**
   * The version hq speaks on this connection: the compatibility rule's `speak`, the whole `major.minor`. The lower
   * minor of a shared major, the site's version when it is one major behind, and hq's own when it is one ahead. Gate
   * anything added after a `major.0` on this, never on hq's own version, or hq will send frames the site cannot read.
   */
  protocol: ProtocolVersion
}

const OWN_PROTOCOL = parseProtocolVersion(SITE_PROTOCOL_VERSION)!

/** `features` on a request came in site protocol 1.12; a site speaking less is never sent it. */
const FIRST_WITH_FEATURES = { major: 1, minor: 12 }

export function speaksFeatures(v: ProtocolVersion): boolean {
  return v.major > FIRST_WITH_FEATURES.major || (v.major === FIRST_WITH_FEATURES.major && v.minor >= FIRST_WITH_FEATURES.minor)
}

/**
 * Where the organisation's switches come from: the ones read in the last few seconds, at once, else a read. A site
 * applies them with the same rule (adr-0172), so every request carries them.
 */
export type FeatureSwitchesSource = {
  fresh(): FeatureSwitches | null
  read(): Promise<FeatureSwitches>
}

const NO_SWITCHES_SOURCE: FeatureSwitchesSource = { fresh: () => ({}), read: async () => ({}) }

/** A connection's version as a frame's `version` field carries it. */
export function spokenVersion(conn: Pick<SiteConnection, 'protocol'>): string {
  return `${conn.protocol.major}.${conn.protocol.minor}`
}

/**
 * One live connection per Execution Site, and the means to ask one a question.
 * Holds no database of its own — the status store is injected, which is what
 * lets the handshake and round-trip tests run against a real socket.
 */
export class SiteChannelRegistry {
  private readonly connections = new Map<string, SiteConnection>()

  constructor(
    private readonly store: SiteStatusStore,
    private readonly switches: FeatureSwitchesSource = NO_SWITCHES_SOURCE,
  ) {}

  async add(siteId: string, ws: WebSocket, protocol: ProtocolVersion = OWN_PROTOCOL): Promise<SiteConnection> {
    // A site that reconnects before hq noticed the old socket died would leave
    // two entries, and a request would go down whichever the map happened to
    // hold. Newest wins, and the displaced socket is closed explicitly rather
    // than left to time out.
    const previous = this.connections.get(siteId)
    if (previous && previous.ws !== ws) {
      previous.pending.rejectAll('Replaced by a newer connection from the same site')
      previous.ws.close(4000, 'Replaced by a newer connection')
    }

    const conn: SiteConnection = {
      siteId,
      ws,
      pending: new PendingRequests(),
      connectedAt: new Date(),
      protocol,
    }
    this.connections.set(siteId, conn)
    await this.store.markOnline(siteId)
    return conn
  }

  async remove(siteId: string, ws: WebSocket): Promise<void> {
    const current = this.connections.get(siteId)
    // Only the socket that is currently registered may clear the entry. The
    // displaced socket above fires its own close event moments later; without
    // this check it would mark a site offline that is connected right now.
    if (!current || current.ws !== ws) return
    current.pending.rejectAll('Connection closed')
    this.connections.delete(siteId)
    await this.store.markOffline(siteId)
  }

  /**
   * Revocation takes effect on the open socket, not only on the next connect:
   * tell the site (it stops reconnecting on this frame), fail whatever is in
   * flight, and close. `close` rather than `terminate`, so the revoke frame is
   * flushed before the socket goes. The entry is removed first, so this
   * socket's own close event finds nothing to clear and never marks a REVOKED
   * row offline.
   */
  revoke(siteId: string): void {
    const conn = this.connections.get(siteId)
    if (!conn) return
    this.connections.delete(siteId)
    conn.pending.rejectAll('Execution Site revoked')
    try {
      conn.ws.send(JSON.stringify({ version: spokenVersion(conn), type: 'revoke', siteId, payload: {} }))
    } finally {
      conn.ws.close(4001, 'Site revoked')
    }
  }

  /**
   * A rotated credential must not outlive its replacement on a socket that
   * authenticated with it. Closes the live socket so the site reconnects with the
   * new one. `only` limits this to the connection that was open when the rotation
   * happened: one that has since reconnected already carries the new credential.
   * The socket's own close event does the clean-up, so the row reads OFFLINE
   * until the site is back.
   */
  closeForRotation(siteId: string, only?: SiteConnection): void {
    const conn = this.connections.get(siteId)
    if (!conn || (only && conn !== only)) return
    conn.ws.close(4002, 'Credential rotated')
  }

  async touch(siteId: string): Promise<void> {
    await this.store.touch(siteId)
  }

  isOnline(siteId: string): boolean {
    return this.connections.has(siteId)
  }

  get(siteId: string): SiteConnection | null {
    return this.connections.get(siteId) ?? null
  }

  get onlineSiteIds(): string[] {
    return [...this.connections.keys()]
  }

  /** Asks a site one of core's `SiteMethods`, with that method's params, and answers with its result. */
  async request<M extends SiteMethodName>(
    siteId: string,
    method: M,
    params: SiteMethodParams<M>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<SiteMethodResult<M>> {
    let conn = this.connections.get(siteId)
    if (!conn) {
      throw new ChannelRequestFailed(`Execution Site ${siteId} is not connected`, 'offline')
    }
    // Sent at once when the switches are fresh; otherwise read first, and the connection looked up again after.
    let features = speaksFeatures(conn.protocol) ? this.switches.fresh() : null
    if (speaksFeatures(conn.protocol) && !features) {
      features = await this.switches.read()
      conn = this.connections.get(siteId)
      if (!conn) throw new ChannelRequestFailed(`Execution Site ${siteId} is not connected`, 'offline')
    }
    const { requestId, promise } = conn.pending.next(timeoutMs)
    const msg: HQConnectionMessage<ChannelRequestPayload> = {
      version: spokenVersion(conn),
      type: 'channel.request',
      siteId,
      requestId,
      // The method and its params are correlated by `M`, which TypeScript does not carry into the union.
      payload: { method, params, ...(features && speaksFeatures(conn.protocol) ? { features } : {}) } as ChannelRequestPayload,
    }
    conn.ws.send(JSON.stringify(msg))
    return (await promise) as SiteMethodResult<M>
  }
}
