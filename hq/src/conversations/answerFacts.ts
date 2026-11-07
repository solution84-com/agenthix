/**
 * What an answer used, for the ⋯ under it: the model it was written by, how long the turn took, and the tokens it
 * read and wrote, as the turn's record keeps them. Only what was recorded; nothing is estimated.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireConversationReader } from './readingRule'
import { providerStore } from '../providers/store'
import { modelLabel } from '../routing/modelKeys'

export type AnswerFactsView = {
  /** The model's name as the pickers give it; null when the turn kept none. */
  model: string | null
  /** From the turn starting to its end; null while it has not ended. */
  ms: number | null
  tokensRead: number
  tokensWritten: number
}

type TurnFacts = {
  model: string | null
  startedAt: Date | null
  endedAt: Date | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function answerFactsOf(turn: TurnFacts, label: string | null): AnswerFactsView {
  return {
    model: label ?? (turn.model ? turn.model.split('/').pop() ?? turn.model : null),
    ms: turn.startedAt && turn.endedAt ? Math.max(0, turn.endedAt.getTime() - turn.startedAt.getTime()) : null,
    tokensRead: turn.inputTokens + turn.cacheReadTokens + turn.cacheWriteTokens,
    tokensWritten: turn.outputTokens,
  }
}

type Ctx = { user?: { id: string } | null }

export const getAnswerFacts = async (args: { conversationId: string; turnId: string }, context: Ctx): Promise<AnswerFactsView | null> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const ref = await requireConversationReader(args?.conversationId, context.user.id)
  const turn = typeof args.turnId === 'string'
    ? await prisma.inferenceTurn.findFirst({ where: { id: args.turnId, conversationId: ref.id } })
    : null
  // An answer with no record of its turn (sample data, or written before turns were recorded) has nothing to show.
  if (!turn) return null
  const provider = turn.providerId && turn.model ? await providerStore().byId(turn.providerId).catch(() => null) : null
  return answerFactsOf(turn, provider && turn.model ? modelLabel(provider.vendor, turn.model) : null)
}
