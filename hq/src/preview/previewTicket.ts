import { randomBytes } from 'node:crypto'

/**
 * The one-time ticket that carries a signed-in person from hq's origin to a
 * preview's own host (adr-0071).
 *
 * It travels in a URL for exactly one hop, so it is single use, lives about a
 * minute, and names one person and one preview: redeeming it anywhere else,
 * twice, or late gets nothing. It is held in hq's memory, because hq mints and
 * redeems it in the same process and nothing else ever needs to see it.
 */
export const TICKET_TTL_MS = 60_000

interface Held {
  userId: string
  previewId: string
  expiresAt: number
}

export interface TicketStore {
  mint(userId: string, previewId: string): string
  /** Consumes the ticket whatever the answer, so a wrong guess spends it too. */
  redeem(ticket: string, previewId: string): { userId: string } | null
}

export function createTicketStore(now: () => number = Date.now, ttlMs = TICKET_TTL_MS): TicketStore {
  const held = new Map<string, Held>()

  const prune = (): void => {
    const t = now()
    for (const [k, v] of held) if (v.expiresAt <= t) held.delete(k)
  }

  return {
    mint(userId, previewId) {
      prune()
      const ticket = randomBytes(32).toString('base64url')
      held.set(ticket, { userId, previewId, expiresAt: now() + ttlMs })
      return ticket
    },
    redeem(ticket, previewId) {
      const h = held.get(ticket)
      if (!h) return null
      held.delete(ticket)
      if (h.expiresAt <= now() || h.previewId !== previewId) return null
      return { userId: h.userId }
    },
  }
}

/** hq's own store: the action mints into it and the preview host redeems from it. */
export const previewTickets: TicketStore = createTicketStore()
