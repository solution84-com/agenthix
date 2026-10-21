/**
 * The thread's logic, apart from React: merging what the record and the socket deliver, dropping streamed text
 * already seen, and telling committed messages from those waiting behind a reply.
 */
import type {
  ConversationDeltaEvent,
  ConversationMessageView,
  ConversationReplayEvent,
  ConversationStepsEvent,
  ReplyStepView,
} from '../../shared/conversations/protocol'
import { randomId } from '../../shared/randomId'

/** What the running reply has streamed so far. */
export type StreamState = { turnId: string; text: string }

/** Messages by seq, oldest first, each id once; an incoming copy replaces what was held (a waiting message taken, say). */
export function mergeMessages(held: ConversationMessageView[], incoming: ConversationMessageView[]): ConversationMessageView[] {
  const byId = new Map<string, ConversationMessageView>()
  for (const m of held) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

/** In the thread: everything but what waits behind a reply or was taken back. */
export function threadMessages(all: ConversationMessageView[]): ConversationMessageView[] {
  return all.filter((m) => m.queueState !== 'WAITING' && m.queueState !== 'CANCELLED')
}

export function waitingOf(all: ConversationMessageView[]): ConversationMessageView[] {
  return all.filter((m) => m.queueState === 'WAITING')
}

/** The seq to page back from: the oldest message held. */
export function oldestSeq(all: ConversationMessageView[]): number | undefined {
  return all[0]?.seq
}

/**
 * Text arriving from the running reply. `offset` is how many characters came before it, so text already held is
 * dropped. `gap` is set when text is missing before it: the client joins the room again to get the replay.
 */
export function applyDelta(stream: StreamState | null, event: ConversationDeltaEvent): { stream: StreamState | null; gap: boolean } {
  const held = stream && stream.turnId === event.turnId ? stream.text : ''
  if (event.offset > held.length) return { stream, gap: true }
  const end = event.offset + event.text.length
  if (end <= held.length) return { stream, gap: false }
  return { stream: { turnId: event.turnId, text: held + event.text.slice(held.length - event.offset) }, gap: false }
}

/** What a rejoin returns: never shorter than text already held for the same reply. */
export function applyReplay(stream: StreamState | null, event: ConversationReplayEvent): StreamState {
  if (stream && stream.turnId === event.turnId && stream.text.length >= event.text.length) return stream
  return { turnId: event.turnId, text: event.text }
}

/** The running reply's steps, and when it began to work on this screen's clock, so its pill counts on from there. */
export type LiveSteps = { turnId: string; since: number; steps: ReplyStepView[] }

/** Steps arriving from the running reply: the start already held for it is kept, so the count does not jump. */
export function applySteps(held: LiveSteps | null, event: Pick<ConversationStepsEvent, 'turnId' | 'elapsedMs' | 'steps'>, now: number): LiveSteps {
  const since = held && held.turnId === event.turnId ? held.since : now - event.elapsedMs
  return { turnId: event.turnId, since, steps: event.steps }
}

/** A reply that ended, or was committed with its steps kept, has no live steps left. */
export function stepsAfterEnd(held: LiveSteps | null, turnId: string): LiveSteps | null {
  return held && held.turnId === turnId ? null : held
}

/** Whether this is the running turn's committed reply: its words (or its failure), not an action line, card or work started. */
export function isReplyOf(message: ConversationMessageView, turnId: string): boolean {
  return message.role === 'AGENT' && message.turnId === turnId && (message.kind === 'TEXT' || message.kind === 'FAILED')
}

/** The committed reply of the turn being streamed replaces the streamed text. */
export function streamAfterMessage(stream: StreamState | null, message: ConversationMessageView): StreamState | null {
  if (stream && isReplyOf(message, stream.turnId)) return null
  return stream
}

/** A client id made once per message, so sending it again (a retry) is recognised and stored once. */
export function newClientMessageId(): string {
  return randomId()
}

/**
 * The client id for sending `text`: the id of the attempt that failed when the same text is sent again, so the
 * server stores the message once however many times it is sent; a new id for different text.
 */
export function clientIdFor(attempt: { text: string; id: string } | null, text: string): { text: string; id: string } {
  return attempt && attempt.text === text ? attempt : { text, id: newClientMessageId() }
}

export { refusalText as actionErrorText } from '../../shared/refusal'
