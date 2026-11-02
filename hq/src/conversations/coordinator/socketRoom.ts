/**
 * A conversation's socket room, `conversation:<id>` (conversation layer spec, Failure, recovery): joined with
 * the bare conversation id, only after the reading rule. On every join — a first one, or a reconnect — the
 * socket is sent what the running turn has streamed so far, and its steps, so a browser that dropped loses nothing; what was
 * committed it reads from the record.
 */
import {
  CONVERSATION_SOCKET,
  type ConversationReplayEvent,
} from '../../shared/conversations/protocol'
import type { RequireConversationReader } from '../contract'
import { conversationRoom } from './events'
import { liveTurn } from './liveTurns'

export interface ConversationSocket {
  id: string
  data?: { user?: { id: string } }
  join(room: string): unknown
  leave(room: string): unknown
  emit(event: string, payload: unknown): unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

interface Log { info(message: string): void; warn(message: string): void }

/** The replay for a socket joining now, when a turn of the conversation is running in this process. */
export function replayFor(conversationId: string, now = new Date()): ConversationReplayEvent | null {
  const live = liveTurn(conversationId)
  if (!live) return null
  const steps = live.steps ? { steps: { elapsedMs: now.getTime() - live.steps.from.getTime(), steps: live.steps.steps } } : {}
  return { conversationId, turnId: live.turnId, text: live.text, ...steps }
}

export async function joinConversationRoom(
  socket: ConversationSocket,
  conversationId: unknown,
  requireReader: RequireConversationReader,
  log: Log,
): Promise<boolean> {
  const userId = socket.data?.user?.id
  if (!userId || typeof conversationId !== 'string' || conversationId === '' || conversationId.length > 200) return false
  try {
    await requireReader(conversationId, userId)
  } catch {
    log.warn(`${socket.id} denied join to ${conversationRoom(conversationId)}: may not read this conversation`)
    return false
  }
  socket.join(conversationRoom(conversationId))
  const replay = replayFor(conversationId)
  if (replay) socket.emit(CONVERSATION_SOCKET.replay, replay)
  return true
}

export function registerConversationRoom(socket: ConversationSocket, requireReader: RequireConversationReader, log: Log): void {
  // A join may ask to be answered once the socket is in the room: what the screen reads after that answer misses
  // nothing, a reply that ended between its first read and the join included.
  socket.on(CONVERSATION_SOCKET.subscribe, (conversationId, answer) => {
    void joinConversationRoom(socket, conversationId, requireReader, log).then((joined) => {
      if (typeof answer === 'function') answer(joined)
    })
  })
  socket.on(CONVERSATION_SOCKET.unsubscribe, (conversationId) => {
    if (typeof conversationId === 'string') socket.leave(conversationRoom(conversationId))
  })
}
