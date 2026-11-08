/**
 * The conversations whose voice is held through this process, and the sockets each speaks to. Held in memory
 * only: the record holds who holds voice (`voiceHolderId`) and the quiet lines; this is what only the process
 * with the holder's socket can know. One timer checks the silence rule for all of them.
 */
import type { ClaimedTurn } from '../coordinator/claim'
import type { HeldUpdate } from './hand'
import { VoiceSession, type TurnSpeech, type VoiceSessionDeps } from './session'

const sessions = new Map<string, VoiceSession>()
const SILENCE_TICK_MS = 1_000
let ticker: NodeJS.Timeout | null = null
let onSilence: ((conversationId: string, holderId: string) => void) | null = null

export function voiceSession(conversationId: string): VoiceSession | undefined {
  return sessions.get(conversationId)
}

/** Opens voice for its holder, or adds a socket of theirs to voice already open. */
export function openVoiceSession(conversationId: string, holderId: string, socketId: string, deps: VoiceSessionDeps): VoiceSession {
  const open = sessions.get(conversationId)
  if (open && open.holderId === holderId) {
    open.socketIds.add(socketId)
    return open
  }
  open?.close()
  const session = new VoiceSession(conversationId, holderId, new Set([socketId]), deps)
  sessions.set(conversationId, session)
  startTicker()
  return session
}

export function closeVoiceSession(conversationId: string): VoiceSession | undefined {
  const session = sessions.get(conversationId)
  if (!session) return undefined
  session.close()
  sessions.delete(conversationId)
  if (sessions.size === 0) stopTicker()
  return session
}

/** Every voice held through this process. */
export function allVoiceSessions(): VoiceSession[] {
  return [...sessions.values()]
}

/** The voice a socket speaks to, so its disconnect can let go of it. */
export function sessionsOfSocket(socketId: string): VoiceSession[] {
  return [...sessions.values()].filter(s => s.socketIds.has(socketId))
}

/** What ends voice when the silence rule says so: the handlers' end, set once. */
export function whenSilent(end: (conversationId: string, holderId: string) => void): void {
  onSilence = end
}

function startTicker(): void {
  if (ticker) return
  ticker = setInterval(() => {
    for (const session of sessions.values()) {
      if (session.silenceCheck() === 'end') onSilence?.(session.conversationId, session.holderId)
    }
  }, SILENCE_TICK_MS)
  ticker.unref()
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

/**
 * Whether a turn is spoken: one that answers the holder, or a report or continuation turn while voice is on. A
 * typed message from anyone else is answered in text, read by all.
 */
export function listeningSession(conversationId: string, turn: Pick<ClaimedTurn, 'trigger' | 'actingUserId'>): VoiceSession | null {
  const session = sessions.get(conversationId)
  if (!session) return null
  if (turn.trigger === 'MESSAGE' && turn.actingUserId !== session.holderId) return null
  return session
}

/**
 * The coordinator's hooks: a turn's speech, when it is spoken; and an agent's raised hand — while someone holds
 * voice, the cards awaiting a report or continuation turn wait for the holder's invitation (hand.ts).
 */
export const turnVoice = {
  begin(claimed: ClaimedTurn): TurnSpeech | null {
    const session = listeningSession(claimed.conversation.id, claimed)
    if (!session) return null
    if (claimed.trigger !== 'MESSAGE') {
      // A hand let go unanswered takes its turn as text.
      const asText = session.hand.asText()
      session.hand.taken()
      if (asText) return null
    }
    return session.speechFor(claimed.turnId)
  },
  holdsCards(conversationId: string): boolean {
    return sessions.get(conversationId)?.hand.holds() ?? false
  },
  raiseHand(conversationId: string, update: HeldUpdate): void {
    sessions.get(conversationId)?.hand.raise(update)
  },
}

/** For tests: forget every session. */
export function resetVoiceSessions(): void {
  for (const session of sessions.values()) session.close()
  sessions.clear()
  stopTicker()
}
