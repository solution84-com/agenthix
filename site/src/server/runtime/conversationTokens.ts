/**
 * One opaque platform token per conversation, pointed at the current turn's
 * capability and at nothing between turns (adr-0082, spec §2).
 *
 * A harness that stays warm across a conversation's turns (adr-0081) is given
 * its platform token once — OpenCode's per-conversation tool connection, a
 * Claude process's `SITE_MCP_KEY` — so the token cannot be per run. It is
 * a reference instead: at the start of each turn the site points it at that
 * run's capability holder, which hq signed for the run as it always has, and
 * at the end of the turn at nothing. A process the conversation left running
 * keeps the token and can act through the platform only while a turn of its
 * conversation runs, and only with that turn's authority.
 *
 * Resolving the token also says which run it acts for, so a call made with it
 * — a tool call, a gate decision — is recorded against the turn it happened in.
 *
 * In memory, like the per-run tokens (runTokens.ts): nothing here survives a
 * restart, and neither does a turn. A conversation that ends has its token
 * revoked; if it ever runs again it is given a new one.
 */
import { randomBytes } from 'node:crypto'
import type { CapabilityHolder } from '../../agents/runtime/capabilityRenewal'

export type ConversationTurn = { runId: string; holder: CapabilityHolder }

type Conversation = { token: string; turn: ConversationTurn | null }

const bySession = new Map<string, Conversation>()
const byToken = new Map<string, string>()

/**
 * The conversation's token, pointed at this turn. Minted on the conversation's
 * first turn and the same on every later one. `holder` must be the run's own
 * holder instance, the one its renewal loop updates (see runTokens.ts).
 */
export function pointConversationToken(sessionId: string, runId: string, holder: CapabilityHolder): string {
  let conversation = bySession.get(sessionId)
  if (!conversation) {
    conversation = { token: randomBytes(32).toString('base64url'), turn: null }
    bySession.set(sessionId, conversation)
    byToken.set(conversation.token, sessionId)
  }
  conversation.turn = { runId, holder }
  return conversation.token
}

/**
 * The turn is over: the token resolves to nothing until the next one. Only
 * the turn named is cleared, so a late clear from an earlier run cannot take
 * away a later turn's authority.
 */
export function clearConversationTurn(sessionId: string, runId: string): void {
  const conversation = bySession.get(sessionId)
  if (conversation?.turn?.runId === runId) conversation.turn = null
}

/** The conversation has ended (closed, deleted, its person gone): its token is dead for good. */
export function revokeConversationToken(sessionId: string): void {
  const conversation = bySession.get(sessionId)
  if (!conversation) return
  bySession.delete(sessionId)
  byToken.delete(conversation.token)
}

/** The conversation and the turn a token acts for now, or null between turns, after expiry or for an unknown token. */
export function resolveConversationToken(token: string): ({ sessionId: string } & ConversationTurn) | null {
  const sessionId = byToken.get(token)
  const turn = sessionId ? bySession.get(sessionId)?.turn : null
  if (!sessionId || !turn) return null
  if (Date.now() >= turn.holder.expiresAt) return null
  return { sessionId, ...turn }
}

/** Points every conversation whose turn's capability has expired at nothing. Returns how many. */
export function sweepExpiredConversationTurns(now: number = Date.now()): number {
  let swept = 0
  for (const conversation of bySession.values()) {
    if (conversation.turn && now >= conversation.turn.holder.expiresAt) {
      conversation.turn = null
      swept++
    }
  }
  return swept
}
