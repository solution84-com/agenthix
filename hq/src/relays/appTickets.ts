/**
 * The one way an app ticket leaves hq (adr-0169), and hq's word on it afterwards. Every ticket is signed by
 * `signAppTicket` and written in hq's book before it is handed back. Before every new stream, a relay asks whether
 * the ticket behind a cookie still stands (`relay.ask`). It stands only while all of these hold:
 *
 * - it is in the book, for that person, app and live preview, asked by the relay it names, and has not run out;
 * - nothing revoked it: its person, its app, its live preview or the ticket itself;
 * - its live preview is running, and the person may still see it (`livePreviewOpenTo`).
 *
 * The book is in memory: when hq restarts, every ticket reads as no, and the browser enters again through hq. What hq
 * cuts off is pushed to every relay at once (`relay.revoke`), so open streams end without waiting for an ask.
 */
import { RELAY_PROTOCOL_VERSION, type AppTicketInput, type RelayAsk, type RelayRevoke } from '@agenthix/core'
import type { SignedAppTicket } from './relayTokens'

type Booked = {
  relay: string; person: string; appId: string; livePreviewId: string; issuedAtMs: number; expiresAtMs: number; revoked: boolean
}

/** Far more than a fleet's open apps need; past it the oldest is dropped (its browser enters again). */
export const MAX_BOOKED = 50_000

export type AppTicketDeps = {
  sign(input: Omit<AppTicketInput, 'enterBy'>): Promise<SignedAppTicket>
  /** Whether the live preview is running and `person` may see it now, as hq's own records say. */
  livePreviewOpenTo(livePreviewId: string, person: string): Promise<boolean>
  /** Pushes a revocation to every relay connected now. */
  broadcast(frame: RelayRevoke): void
  now?: () => number
}

export type AppTicketAsk = Pick<RelayAsk, 'ticketId' | 'person' | 'appId' | 'livePreviewId'>
export type AppTicketRevoke = Omit<RelayRevoke, 'type' | 'version'>

export function createAppTicketBook(deps: AppTicketDeps) {
  const book = new Map<string, Booked>()
  const now = () => (deps.now ?? Date.now)()

  function sweep(): void {
    const t = now()
    for (const [id, b] of book) if (b.expiresAtMs <= t) book.delete(id)
  }

  return {
    async issue(input: Omit<AppTicketInput, 'enterBy'>): Promise<SignedAppTicket> {
      const issuedAtMs = now()
      const signed = await deps.sign(input)
      sweep()
      while (book.size >= MAX_BOOKED) book.delete(book.keys().next().value as string)
      book.set(signed.jti, {
        relay: input.relay, person: input.person, appId: input.appId, livePreviewId: input.livePreviewId,
        issuedAtMs, expiresAtMs: signed.expiresAt, revoked: false,
      })
      return signed
    },

    async stands(relayId: string, ask: AppTicketAsk): Promise<boolean> {
      const b = book.get(ask.ticketId)
      if (!b || b.revoked || b.expiresAtMs <= now() || b.relay !== relayId) return false
      if (b.person !== ask.person || b.appId !== ask.appId || b.livePreviewId !== ask.livePreviewId) return false
      return deps.livePreviewOpenTo(b.livePreviewId, b.person)
    },

    /** Cuts off what the frame names, in the book and at every relay. */
    revoke(what: AppTicketRevoke): void {
      for (const b of book.values()) {
        if ((what.person !== undefined && b.person === what.person)
          || what.apps?.includes(b.appId) || what.livePreviews?.includes(b.livePreviewId)) b.revoked = true
      }
      for (const id of what.tickets ?? []) {
        const b = book.get(id)
        if (b) b.revoked = true
      }
      deps.broadcast({ type: 'relay.revoke', version: RELAY_PROTOCOL_VERSION, ...what })
    },

    get size(): number {
      return book.size
    },
  }
}

export type AppTicketBook = ReturnType<typeof createAppTicketBook>
