/**
 * Claiming a conversation's next turn (conversation layer spec, A message while a reply streams; A completion
 * while a reply streams): under the conversation's row lock, and only while no live turn holds it, the oldest
 * untaken messages by one author become one new turn that holds the one-turn lock. With no person's message
 * waiting, every card awaiting a turn becomes one report or continuation turn (cardTurn.ts). A lock whose lease
 * ran out belonged to a process that died: its turn is failed first, with a message saying so, and the lock
 * passes on.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { ConversationHomeRef } from '../contract'
import type { ContinuationObligation, ConversationMessageView } from '../../shared/conversations/protocol'
import { appendMessageIn } from '../store/messages'
import { claimLock, releaseLock } from './lock'
import { nextBatch } from './batch'
import { planCardTurn, type AwaitingCard, type CardTurnPlan, type ContinuationCheck } from './cardTurn'
import { continuationCheck } from './continuationChecks'
import { leadAgentId } from '../taskThread/lead'
import { heldUpdate, type HeldUpdate } from '../voice/hand'

export const HQ_RESTARTED = 'HQ restarted before this reply finished. Send your message again to get an answer.'

export interface TurnConversation extends ConversationHomeRef {
  talkingModel: string | null
  talkingProviderId: string | null
}

export interface ClaimedTurn {
  turnId: string
  conversation: TurnConversation
  /** What it answers: a person's messages, or the cards awaiting a turn (a report, or a continuation in its place). */
  trigger: 'MESSAGE' | 'REPORT' | 'CONTINUATION'
  /** The person the turn answers: the author of every message it takes; for a continuation, who authorised it. */
  actingUserId: string | null
  /** The messages it answers, oldest first, marked taken by it in the same transaction as the claim. */
  inputIds: string[]
  /** For a continuation: the depth of the obligation it carries out. */
  continuationDepth?: number
  /** For a continuation: the next step each continued operation asked for. */
  continuations?: CardTurnPlan['continuations']
  /** When its first message arrived: the start of the queued wait. */
  queuedAt: Date
  startedAt: Date
}

export interface ClaimResult {
  claimed: ClaimedTurn | null
  /** The FAILED message written for a turn whose process died holding the lock, to show on screen. */
  abandoned: ConversationMessageView | null
  /** Cards that would have taken a turn, held while someone holds voice: the agent raises its hand instead. */
  held?: HeldUpdate
}

/**
 * Fails a turn that can no longer finish — its process is gone — and releases its lock. Writes its FAILED
 * message only when this call is the one that failed it.
 */
export async function abandonTurnIn(
  tx: Prisma.TransactionClient,
  conversationId: string,
  turnId: string,
  reason: string,
  now: Date,
): Promise<ConversationMessageView | null> {
  const turn = await tx.inferenceTurn.findUnique({ where: { id: turnId }, select: { state: true, agentId: true } })
  let failed: ConversationMessageView | null = null
  if (turn && (turn.state === 'RUNNING' || turn.state === 'QUEUED')) {
    await tx.inferenceTurn.update({ where: { id: turnId }, data: { state: 'FAILED', error: reason, endedAt: now } })
    const { message } = await appendMessageIn(tx, {
      conversationId, role: 'AGENT', kind: 'FAILED', body: { reason }, agentId: turn.agentId, turnId,
    })
    failed = message
  }
  await releaseLock(tx, conversationId, turnId)
  return failed
}

/**
 * The person messages no turn has taken yet, in one conversation or in all: what they said, and their answers to
 * approval requests given on the card. A cancelled one is never taken.
 */
export function untakenWhere(conversationId?: string): Prisma.ConversationMessageWhereInput {
  return {
    ...(conversationId ? { conversationId } : {}),
    role: 'PERSON', kind: { in: ['TEXT', 'APPROVAL_ANSWER'] }, turnId: null, OR: [{ queueState: null }, { queueState: 'WAITING' }],
  }
}

/** The cards (completions, approval requests) no turn has taken yet, in one conversation or in all. */
export function awaitingCardsWhere(conversationId?: string): Prisma.ConversationMessageWhereInput {
  return { ...(conversationId ? { conversationId } : {}), awaitsTurn: true, turnId: null }
}

function obligationOf(value: unknown): ContinuationObligation | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Partial<ContinuationObligation>
  if (typeof o.authorisedById !== 'string' || typeof o.nextStep !== 'string' || typeof o.depth !== 'number') return null
  return o as ContinuationObligation
}

async function awaitingCards(tx: Prisma.TransactionClient, conversationId: string): Promise<AwaitingCard[]> {
  const cards = await tx.conversationMessage.findMany({
    where: awaitingCardsWhere(conversationId),
    orderBy: { seq: 'asc' },
    select: { id: true, seq: true, kind: true, operationId: true, createdAt: true },
  })
  const operationIds = cards.map(c => c.operationId).filter((id): id is string => id !== null)
  const operations = await tx.operation.findMany({ where: { id: { in: operationIds } }, select: { id: true, state: true, continuation: true } })
  const byId = new Map(operations.map(o => [o.id, o]))
  return cards
    .filter((c): c is typeof c & { kind: AwaitingCard['kind'] } => c.kind === 'RESULT' || c.kind === 'APPROVAL_REQUEST')
    .map(c => {
      const op = c.operationId ? byId.get(c.operationId) : undefined
      return {
        id: c.id, seq: c.seq, kind: c.kind, operationId: c.operationId, createdAt: c.createdAt,
        operationState: op?.state ?? null, continuation: obligationOf(op?.continuation),
      }
    })
}

export type ContinuationCheckFor = (conversationId: string, agentId: string | null) => ContinuationCheck

export async function claimNextTurn(
  conversationId: string,
  now: Date = new Date(),
  checkFor: ContinuationCheckFor = continuationCheck,
  /** Whether cards awaiting a turn wait now (voice's raised hand); a person's message never does. */
  holdsCards: (conversationId: string) => boolean = () => false,
): Promise<ClaimResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const row = await tx.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true, status: true,
        talkingModel: true, talkingProviderId: true, activeTurnId: true, activeTurnLeaseUntil: true,
      },
    })
    if (!row || row.status === 'CLOSED') return { claimed: null, abandoned: null }
    // A task's thread talks with its task's agent now; with none, nothing is answered until one is assigned.
    const agentId = await leadAgentId(row)
    const held = row.activeTurnId !== null && row.activeTurnLeaseUntil !== null && row.activeTurnLeaseUntil >= now
    if (held) return { claimed: null, abandoned: null }

    const abandoned = row.activeTurnId ? await abandonTurnIn(tx, conversationId, row.activeTurnId, HQ_RESTARTED, now) : null

    const pending = await tx.conversationMessage.findMany({
      where: untakenWhere(conversationId),
      orderBy: { seq: 'asc' },
      select: { id: true, seq: true, authorId: true, createdAt: true, queueState: true },
    })
    const batch = nextBatch(pending)
    const first = batch[0]
    // Person messages first; with none waiting, the cards awaiting a turn.
    if (!agentId && row.home === 'TASK') return { claimed: null, abandoned }
    const cards = first ? [] : await awaitingCards(tx, conversationId)
    const hand = holdsCards(conversationId) ? heldUpdate(cards) : null
    if (hand) return { claimed: null, abandoned, held: hand }
    const plan = first ? null : await planCardTurn(cards, checkFor(conversationId, agentId))
    if (!first && !plan) return { claimed: null, abandoned }
    const trigger = plan?.trigger ?? 'MESSAGE'
    const actingUserId = first ? first.authorId : plan!.actingUserId
    const inputIds = first ? batch.map(m => m.id) : plan!.cardIds
    const queuedAt = first
      ? first.createdAt
      : (await tx.conversationMessage.findFirstOrThrow({ where: { id: plan!.cardIds[0] }, select: { createdAt: true } })).createdAt

    const turn = await tx.inferenceTurn.create({
      data: {
        conversationId,
        state: 'RUNNING',
        trigger,
        actingUserId,
        agentId,
        model: row.talkingModel,
        providerId: row.talkingProviderId,
        createdAt: queuedAt,
        startedAt: now,
      },
      select: { id: true },
    })
    // The row lock makes this certain; the condition is what holds across processes that do not take it.
    if (!(await claimLock(tx, conversationId, turn.id, now))) throw new Error(`The lock of conversation ${conversationId} was taken while held`)
    if (first) {
      // Taken under the row lock, so a Cancel on a waiting message (waitingMessages.ts) and this claim never both
      // win. Only the queue's columns: store/messages.ts's updateMessage cannot join a transaction.
      const waitingIds = batch.filter(m => m.queueState === 'WAITING').map(m => m.id)
      await tx.conversationMessage.updateMany({ where: { id: { in: inputIds } }, data: { turnId: turn.id } })
      if (waitingIds.length > 0) {
        await tx.conversationMessage.updateMany({ where: { id: { in: waitingIds } }, data: { queueState: 'TAKEN' } })
      }
    } else {
      await tx.conversationMessage.updateMany({ where: { id: { in: inputIds } }, data: { turnId: turn.id, awaitsTurn: false } })
    }

    return {
      claimed: {
        turnId: turn.id,
        trigger,
        conversation: {
          id: row.id, home: row.home, projectId: row.projectId, taskId: row.taskId, openedById: row.openedById,
          agentId, talkingModel: row.talkingModel, talkingProviderId: row.talkingProviderId,
        },
        actingUserId,
        inputIds,
        ...(plan?.trigger === 'CONTINUATION' ? { continuationDepth: plan.continuationDepth, continuations: plan.continuations } : {}),
        queuedAt,
        startedAt: now,
      },
      abandoned,
    }
  })
}
