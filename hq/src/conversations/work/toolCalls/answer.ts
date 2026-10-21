/**
 * Answering an approval request (conversation layer spec, Approval, two cases, one shape). The answer is a message
 * of kind APPROVAL_ANSWER by the person who answered, naming them; then the operation's owner carries it out.
 *
 * - From the card: the message is admitted as a sent message is — idempotent by the client's id, waiting behind a
 *   running turn — and the lead takes a turn on it, unless what was answered will come back with a result of its
 *   own: an approval, or a worker told of a decline, which finishes as it decides. Then the work's result is the
 *   one reply (workers and results spec, Results), and the answer is filed under the turn that presented the
 *   request, so it is in the record the lead reads and no turn is spent on it alone.
 * - Through the lead (`answer_approval`, a person's "yes" in words): the message is the current turn's, which
 *   answers in it, so no second turn is spent.
 *
 * Whoever answers passes the asker's checks, re-run as them (requests.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import type { ApprovalAnswer, ConversationMessageView } from '../../../shared/conversations/protocol'
import { appendMessage, appendMessageIn, toMessageView, updateMessage } from '../../store/messages'
import { conversationEvents } from '../../coordinator/events'
import { openText } from '../../sealing'
import { scheduleConversation } from '../../coordinator/scheduler'
import { Logger } from '../../../server/utils/logger'
import { ownerOf } from './registryLater'
import { answererRefusal, requestDone } from './requests'
import { ledger } from '../../long/ledger'
import { leadAgentId } from '../../taskThread/lead'

const logger = new Logger('ConversationApprovals')

export const NOTE_MAX_CHARS = 2_000
export const ALREADY_ANSWERED = 'This request is no longer waiting for an answer.'
export const NOT_FOUND = 'That request was not found'
export const OWN_REQUEST = 'You asked for this in this reply: only the person can answer it, after they have read it'

export type AnswerVia =
  | { kind: 'card'; clientMessageId: string }
  | { kind: 'turn'; turnId: string }

export interface AnswerInput {
  conversationId: string
  operationId: string
  answer: ApprovalAnswer
  note: string | null
  answererId: string
  via: AnswerVia
  /** An answer said aloud (voice): what the person said, recorded with it. */
  transcript?: string
}

export interface Answered { message: ConversationMessageView; duplicate: boolean; queued: boolean }

/**
 * Whether the lead replies to this answer on its own: only when nothing else will come back — a tool's or a
 * task's decline ends there. An approval runs the work on, and a worker told of a decline finishes, and their
 * result is presented when it comes.
 */
export function answerNeedsReply(kind: string, answer: ApprovalAnswer): boolean {
  return answer === 'decline' && kind !== 'WORKER'
}

/** The turn an answer needing no reply is filed under: the one that presented the request, else the one that asked. */
async function presentingTurn(operationId: string, askedIn: string | null): Promise<string | null> {
  const card = await prisma.conversationMessage.findFirst({
    where: { operationId, kind: 'APPROVAL_REQUEST', turnId: { not: null } },
    orderBy: { seq: 'desc' },
    select: { turnId: true },
  })
  return card?.turnId ?? askedIn
}

async function existingAnswer(conversationId: string, clientMessageId: string): Promise<ConversationMessageView | null> {
  const row = await prisma.conversationMessage.findUnique({ where: { conversationId_clientMessageId: { conversationId, clientMessageId } } })
  return row ? toMessageView(row) : null
}

/**
 * The answer as the person's message: in the turn when through the lead; from the card, filed under `filedUnder`
 * when it needs no reply, else behind a running turn.
 */
async function writeAnswer(input: AnswerInput, body: { answer: ApprovalAnswer; note?: string; transcript?: string }, filedUnder: string | null) {
  const base = {
    conversationId: input.conversationId, role: 'PERSON' as const, kind: 'APPROVAL_ANSWER' as const, body,
    authorId: input.answererId, operationId: input.operationId, spoken: input.transcript !== undefined,
  }
  if (input.via.kind === 'turn') {
    return appendMessage({ ...base, turnId: input.via.turnId, clientMessageId: `answer:${input.operationId}:${input.via.turnId}` })
  }
  const { clientMessageId } = input.via
  if (filedUnder) return appendMessage({ ...base, turnId: filedUnder, clientMessageId })
  return prisma.$transaction(async (tx) => {
    // Under the row lock the claim also takes, as admitting a sent message does.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${input.conversationId} FOR UPDATE`
    const row = await tx.conversation.findUniqueOrThrow({ where: { id: input.conversationId }, select: { activeTurnId: true, activeTurnLeaseUntil: true } })
    const busy = row.activeTurnId !== null && row.activeTurnLeaseUntil !== null && row.activeTurnLeaseUntil >= new Date()
    return appendMessageIn(tx, { ...base, clientMessageId, queueState: busy ? 'WAITING' : null })
  })
}

/** Words for a failed answer, recorded beside it so the lead's turn on it knows it did not go through. */
function failureWords(err: unknown): string {
  if (err instanceof HttpError && err.statusCode < 500) return `That answer could not be carried out: ${err.message}`
  return 'That answer could not be carried out. Answer again to retry.'
}

/** The answer, kept in the ledger so it survives compaction (long conversations spec, The ledger). */
async function keepApproval(input: AnswerInput, sourceSeq: number, note: string | null): Promise<void> {
  try {
    const row = await prisma.operation.findUnique({ where: { id: input.operationId }, select: { title: true } })
    const title = row ? openText(row.title) : 'the request'
    const text = `${input.answer === 'approve' ? 'Approved' : 'Declined'}: ${title}${note ? ` (their note: ${note})` : ''}`
    await ledger.record(input.conversationId, { kind: 'approval', text, operationId: input.operationId, sourceSeq })
  } catch (err) {
    logger.error(`Could not keep the answer to operation ${input.operationId} in the ledger`, err)
  }
}

export async function answerRequest(input: AnswerInput): Promise<Answered> {
  const note = input.note?.trim() || null
  if (note && note.length > NOTE_MAX_CHARS) throw new HttpError(400, `A note can be at most ${NOTE_MAX_CHARS} characters`)
  const op = await prisma.operation.findFirst({
    where: { id: input.operationId, conversationId: input.conversationId },
    select: {
      id: true, kind: true, state: true, toolName: true, boundaryType: true, boundaryId: true, turnId: true,
      conversation: { select: { home: true, taskId: true, agentId: true } },
    },
  })
  if (!op) throw new HttpError(404, NOT_FOUND)
  // The same tap sent twice is the one answer, carried out once.
  if (input.via.kind === 'card') {
    const repeat = await existingAnswer(input.conversationId, input.via.clientMessageId)
    if (repeat) return { message: repeat, duplicate: true, queued: repeat.queueState === 'WAITING' }
  }
  if (op.state !== 'WAITING_FOR_APPROVAL') throw new HttpError(409, ALREADY_ANSWERED)
  // The lead never answers its own ask in the reply that made it: that would be no one's approval.
  if (input.via.kind === 'turn' && op.turnId === input.via.turnId) throw new HttpError(403, OWN_REQUEST)
  // In a task's thread anyone who may speak there may answer, held to the asker's checks with the task's agent now.
  const refusal = await answererRefusal(op, input.answererId, await leadAgentId(op.conversation))
  if (refusal) throw new HttpError(403, refusal)

  const filedUnder = input.via.kind === 'card' && !answerNeedsReply(op.kind, input.answer) ? await presentingTurn(op.id, op.turnId) : null
  const written = await writeAnswer(input, {
    answer: input.answer, ...(note ? { note } : {}), ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
  }, filedUnder)
  const { duplicate } = written
  let { message } = written
  if (!duplicate) conversationEvents.message(input.conversationId, message)
  try {
    if (!duplicate) await (await ownerOf(op.kind)).answerApproval(op.id, input.answer, note, input.answererId)
  } catch (err) {
    if (!(err instanceof HttpError && err.statusCode < 500)) logger.error(`Could not carry out the answer to operation ${op.id}`, err)
    // It did not go through: the lead takes a turn on it after all, and reads the notice beside it.
    if (filedUnder && !duplicate) message = await updateMessage(message.id, { turnId: null })
    const notice = await appendMessage({ conversationId: input.conversationId, role: 'PLATFORM', kind: 'NOTICE', body: { text: failureWords(err) } })
    conversationEvents.message(input.conversationId, notice.message)
    if (input.via.kind === 'card') scheduleConversation(input.conversationId)
    throw err
  }
  await requestDone(op.id)
  if (!duplicate) await keepApproval(input, message.seq, note)
  if (input.via.kind === 'card' && !filedUnder) scheduleConversation(input.conversationId)
  return { message, duplicate, queued: message.queueState === 'WAITING' }
}
