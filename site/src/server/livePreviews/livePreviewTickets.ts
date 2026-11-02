/**
 * The site's own single-use tickets for an app's entry (live preview spec section 4, *Opening it*): answered to hq's
 * `livePreview.act` `app.open` for one person, one app and one entry, and redeemed once, by the app ticket's first
 * stream (`../relay/appServe.ts`). In memory only: a restart forgets them, and the person enters again through HQ.
 * Every ticket of a live preview is voided when it pauses or stops.
 */
import { randomBytes } from 'node:crypto'
import { LIVE_PREVIEW_TICKET_LIFE_MS, type AppEntry, type LivePreviewTicket } from '@agenthix/core'
import { onLivePreviewChange } from './livePreviewStore'

type Held = { livePreviewId: string; personId: string; appId: string; entry: AppEntry; expiresAtMs: number }

const held = new Map<string, Held>()
const MAX_HELD = 2_000

onLivePreviewChange(row => {
  if (row.state.state === 'paused' || row.state.state === 'stopped') voidTicketsOf(row.id)
})

function sweep(now: number): void {
  for (const [t, h] of held) if (h.expiresAtMs <= now) held.delete(t)
}

export function issueTicket(h: Omit<Held, 'expiresAtMs'>, now = Date.now()): LivePreviewTicket {
  sweep(now)
  while (held.size >= MAX_HELD) held.delete(held.keys().next().value as string)
  const ticket = randomBytes(32).toString('base64url')
  const expiresAtMs = now + LIVE_PREVIEW_TICKET_LIFE_MS
  held.set(ticket, { ...h, expiresAtMs })
  return { ticket, expiresAt: new Date(expiresAtMs).toISOString() }
}

/** Takes the ticket once, for exactly the live preview, person, app and entry it was answered for; null otherwise. */
export function redeemTicket(ticket: string, want: Omit<Held, 'expiresAtMs'>, now = Date.now()): boolean {
  const h = held.get(ticket)
  held.delete(ticket)
  if (!h || h.expiresAtMs <= now) return false
  return h.livePreviewId === want.livePreviewId && h.personId === want.personId && h.appId === want.appId && h.entry === want.entry
}

export function voidTicketsOf(livePreviewId: string | null): void {
  for (const [t, h] of held) if (livePreviewId === null || h.livePreviewId === livePreviewId) held.delete(t)
}
