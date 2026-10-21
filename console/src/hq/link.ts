/**
 * What the rest of the Fleet Console needs of its connection to hq (C8): calling hq's console methods, passing sealed
 * envelopes to hq's relay, and hearing what hq sends unasked. The websocket is `WsHqLink` (wsLink.ts); tests stand a
 * fake in its place.
 */
import type {
  HostEnvelope, HostIdentity, ConsoleLinkErrorCode, ConsoleLinkMethod, ConsoleLinkMethods, RelayUndeliverableReason,
} from '@agenthix/core'

export type LinkState = 'connecting' | 'connected' | 'disconnected' | 'refused' | 'versionMismatch'

export type JoinRequestFrame = { joinId: string; identity: HostIdentity; machineName: string; binding: string }
export type PresenceFrame = { hostId: string; fingerprint: string; online: boolean; since: string }

export type LinkEvents = {
  envelope: (envelope: unknown) => void
  undeliverable: (envelopeId: string, reason: RelayUndeliverableReason) => void
  joinRequest: (frame: unknown) => void
  presence: (frame: unknown) => void
  state: (state: LinkState) => void
  /** A connection opened with a code's lookup: the new Fleet Console sends its half of a handover now. */
  redeemOpen: () => void
  /** hq → the running console: a new one asks to take its place (handover/outgoing.ts). */
  handoverRequest: (frame: unknown) => void
  /** hq → the new console: the running one's answer (handover/incoming.ts). */
  handover: (frame: unknown) => void
  /**
   * hq gave a credential to a console started with a handover code before it held any machines — answering the code
   * as one hq made. The credential was not kept: the move did not happen.
   */
  notHandedOver: () => void
  /** hq → console: the address hq moves to (addressFollow.ts). */
  hqAddress: (address: unknown) => void
  /** hq → console: a person lost the fleet admin role (auth/roleCheck.ts). */
  fleetAdminRemoved: (userId: unknown) => void
}

export type HandoverFrame = 'console.handoverAsk' | 'console.handoverDone' | 'console.handoverAck'

export interface HqLink {
  readonly state: LinkState
  call<M extends ConsoleLinkMethod>(method: M, params: ConsoleLinkMethods[M]['params']): Promise<ConsoleLinkMethods[M]['result']>
  /** Throws `HqUnavailableError` when the link is not up. */
  sendEnvelope(envelope: HostEnvelope): void
  /** A frame of a handover, on a connection opened with a code's lookup, before it is the console link. */
  sendHandover(type: HandoverFrame, payload: unknown): void
  on<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): void
}

/** hq does not answer: the link is down, or a call went unanswered. */
export class HqUnavailableError extends Error {
  constructor(message = 'HQ is not answering.') {
    super(message)
    this.name = 'HqUnavailableError'
  }
}

/** hq answered a call with an error. */
export class HqCallError extends Error {
  constructor(readonly code: ConsoleLinkErrorCode, message: string) {
    super(message)
    this.name = 'HqCallError'
  }
}

/** A small listener registry the link and its fakes share. */
export class LinkListeners {
  private readonly listeners: { [E in keyof LinkEvents]: LinkEvents[E][] } = {
    envelope: [], undeliverable: [], joinRequest: [], presence: [], state: [], redeemOpen: [], handoverRequest: [], handover: [],
    notHandedOver: [], hqAddress: [], fleetAdminRemoved: [],
  }

  on<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): void {
    this.listeners[event].push(listener)
  }

  emit<E extends keyof LinkEvents>(event: E, ...args: Parameters<LinkEvents[E]>): void {
    for (const listener of this.listeners[event]) {
      try {
        ;(listener as (...a: Parameters<LinkEvents[E]>) => void)(...args)
      } catch (err) {
        console.error(`[console] ${event} listener failed:`, err instanceof Error ? err.message : err)
      }
    }
  }
}
