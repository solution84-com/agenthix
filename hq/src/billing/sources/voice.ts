/**
 * Voice on the ledger (part 5, U4 and U5).
 *
 * - **Text to speech:** hq makes each call, so it counts the characters it sent; one row per call to the speech
 *   service, with a call id hq makes.
 * - **Speech to text:** the browser streams to the speech service itself, so hq cannot meter it. When hq issues the
 *   token it makes the call id and a ticket, sealed with hq's secrets key, naming who it is for, what it is costed
 *   to and when it was issued. When the session ends the client hands the ticket back with the audio it streamed, and
 *   hq writes one row, the duration capped at the time from the token's issue to now, so a client cannot claim more.
 */
import { randomUUID } from 'node:crypto'
import { NO_USAGE } from '@agenthix/core'
import { decryptSecret, encryptSecret } from '../../server/crypto/secretCrypto'
import { Logger } from '../../server/utils/logger'
import { ledger } from '../store'
import type { CallCosting, LedgerCall } from '../types'

const logger = new Logger('Ledger')

/** A speech call as the voice code holds it: the resolved provider and what its calls are costed to. */
export type VoiceCallAccess = { providerId: string; providerName: string; vendor: string; model: string; costing: CallCosting }

export function ttsCallRow(access: VoiceCallAccess, characters: number, at: Date, place: { conversationId?: string | null; userId?: string | null } = {}, callId: string = randomUUID()): LedgerCall {
  return {
    ...access.costing, purpose: 'tts', callId, at,
    ...(place.conversationId ? { conversationId: place.conversationId } : {}),
    ...(place.userId ? { userId: place.userId } : {}),
    providerId: access.providerId, providerName: access.providerName, vendor: access.vendor, model: access.model,
    usage: { ...NO_USAGE, characters },
  }
}

/** Writes a text-to-speech call's row in the background; a row that cannot be written is logged. */
export function recordTts(access: VoiceCallAccess, characters: number, place: { conversationId?: string | null; userId?: string | null } = {}): void {
  if (characters <= 0) return
  void ledger().then(l => l.writeCall(ttsCallRow(access, characters, new Date(), place)))
    .catch(err => logger.warn(`A text-to-speech call's ledger row was not written: ${err instanceof Error ? err.message : String(err)}`))
}

/** The longest a listening session is counted for, whatever the client says. */
export const STT_SESSION_MAX_MS = 3 * 60 * 60_000
/** A ticket handed back later than this after its issue is refused. */
export const STT_TICKET_MAX_AGE_MS = 24 * 60 * 60_000

type SttTicketBody = { v: 1; callId: string; issuedAt: number; forUserId: string; access: VoiceCallAccess }

export function sealSttTicket(access: VoiceCallAccess, forUserId: string, issuedAt: Date, callId: string = randomUUID(), seal: (s: string) => string = encryptSecret): { callId: string; ticket: string } {
  const body: SttTicketBody = { v: 1, callId, issuedAt: issuedAt.getTime(), forUserId, access }
  return { callId, ticket: seal(JSON.stringify(body)) }
}

/**
 * The row for a speech-to-text session that ended, or why not: a ticket that is not hq's, or is someone else's, or
 * too old. The duration is capped at the time from the token's issue to now, and at `STT_SESSION_MAX_MS`.
 */
export function sttSessionRow(
  ticket: string, byUserId: string, audioMs: number, now: Date, open: (s: string) => string = decryptSecret,
): { ok: true; row: LedgerCall } | { ok: false; reason: string } {
  let body: SttTicketBody
  try {
    body = JSON.parse(open(ticket)) as SttTicketBody
  } catch {
    return { ok: false, reason: 'not a ticket hq issued' }
  }
  if (body.v !== 1 || body.forUserId !== byUserId) return { ok: false, reason: 'not this person’s ticket' }
  const elapsed = now.getTime() - body.issuedAt
  if (elapsed < 0 || elapsed > STT_TICKET_MAX_AGE_MS) return { ok: false, reason: 'the ticket is too old' }
  const reported = Number.isFinite(audioMs) && audioMs > 0 ? Math.floor(audioMs) : 0
  const counted = Math.min(reported, elapsed, STT_SESSION_MAX_MS)
  const { access } = body
  return {
    ok: true,
    row: {
      ...access.costing, purpose: 'stt', userId: byUserId, callId: body.callId, at: now,
      providerId: access.providerId, providerName: access.providerName, vendor: access.vendor, model: access.model,
      usage: { ...NO_USAGE, audioMs: counted },
    },
  }
}

/** Writes a session's row once: a ticket handed back twice counts once (its call id). */
export async function recordSttSession(ticket: string, byUserId: string, audioMs: number, now: Date = new Date()): Promise<boolean> {
  const answer = sttSessionRow(ticket, byUserId, audioMs, now)
  if (!answer.ok) {
    logger.warn(`A speech-to-text session's usage was refused: ${answer.reason}`)
    return false
  }
  return (await ledger()).writeCall(answer.row)
}
