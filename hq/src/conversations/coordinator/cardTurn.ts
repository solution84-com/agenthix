/**
 * The turn every card awaiting one becomes (conversation layer spec, A completion while a reply streams;
 * Authorised automatic continuation): one REPORT turn over all of them, which answers no one; or, when a
 * completed operation carries a continuation whose checks still pass, one CONTINUATION turn in its place, acting
 * as the person who authorised it. Never both for one card.
 *
 * A continuation from another person than the one this turn acts as waits for a turn of its own, so no turn acts
 * as two people. A continuation whose checks fail is reported instead, and does not go on.
 */
import { CONTINUATION_MAX_DEPTH, type ContinuationObligation } from '../../shared/conversations/protocol'

export interface AwaitingCard {
  id: string
  seq: number
  kind: 'RESULT' | 'APPROVAL_REQUEST'
  operationId: string | null
  operationState: string | null
  continuation: ContinuationObligation | null
  createdAt: Date
}

export interface CardTurnPlan {
  trigger: 'REPORT' | 'CONTINUATION'
  /** The person a continuation acts as; null for a report. */
  actingUserId: string | null
  /** How deep the continued sequence already is: the deepest obligation this turn carries out. */
  continuationDepth?: number
  /** The cards this turn takes, oldest first. */
  cardIds: string[]
  continuations: { operationId: string; nextStep: string }[]
}

/** Whether the obligation may still be carried out now, as its person (the three checks, re-run). */
export type ContinuationCheck = (card: AwaitingCard & { operationId: string; continuation: ContinuationObligation }) => Promise<boolean>

type Continuing = AwaitingCard & { operationId: string; continuation: ContinuationObligation }

function mayContinue(card: AwaitingCard): card is Continuing {
  return card.kind === 'RESULT'
    && card.operationId !== null
    && card.operationState === 'COMPLETED'
    && card.continuation !== null
    && card.continuation.depth <= CONTINUATION_MAX_DEPTH
}

export async function planCardTurn(cards: readonly AwaitingCard[], check: ContinuationCheck): Promise<CardTurnPlan | null> {
  const ordered = [...cards].sort((a, b) => a.seq - b.seq)
  if (ordered.length === 0) return null

  let actingUserId: string | null = null
  const continuing = new Set<string>()
  const deferred = new Set<string>()
  for (const card of ordered) {
    if (!mayContinue(card)) continue
    const by = card.continuation.authorisedById
    if (actingUserId !== null && by !== actingUserId) {
      // Checked when its own turn comes, as its own person.
      deferred.add(card.id)
      continue
    }
    if (await check(card)) {
      actingUserId = by
      continuing.add(card.id)
    }
  }

  const taken = ordered.filter(c => !deferred.has(c.id))
  if (actingUserId === null) {
    return { trigger: 'REPORT', actingUserId: null, cardIds: taken.map(c => c.id), continuations: [] }
  }
  const carried = taken.filter((c): c is Continuing => continuing.has(c.id) && mayContinue(c))
  return {
    trigger: 'CONTINUATION',
    actingUserId,
    continuationDepth: Math.max(...carried.map(c => c.continuation.depth)),
    cardIds: taken.map(c => c.id),
    continuations: carried.map(c => ({ operationId: c.operationId, nextStep: c.continuation.nextStep })),
  }
}
