/**
 * Compaction in segments (long conversations spec): due when the context the last turn sent passed the high mark
 * of the model's window; carried out at the start of a turn, before its first model call, or when the person
 * presses *Summarise now* — never within a turn. It folds the window's messages older than the low mark into one
 * new segment, written once from those verbatim messages and never touched again, with the ledger head as it
 * stands; then a SUMMARISED message goes into the record with the span, the brief and what the ledger kept.
 */
import { prisma } from 'wasp/server'
import type { Compactor, ContextWindowOf, ModelAdapter, ResolvedAccess, TurnUsage } from '../contract'
import { COMPACT_HIGH_MARK, COMPACT_LOW_MARK, type ConversationMessageView } from '../../shared/conversations/protocol'
import { sealText } from '../sealing'
import { appendMessageIn } from '../store/messages'
import { asLead, awaitingCardIds, joinedMessages, leadSystem, readAll, windowOf } from '../coordinator/context'
import type { ConversationEvents } from '../coordinator/events'
import { foldRange, type FoldRange, type WindowMessage } from './fold'
import { boundedHead, entryText, type KeptEntry } from './ledgerHead'
import type { Ledger } from './ledger'
import { readSegments } from './segments'
import { parseSummariserAnswer, summariserRequest } from './summariser'
import { estimateTokens } from './windows'
import { leadAgentId } from '../taskThread/lead'

export interface CompactorDeps {
  model: ModelAdapter
  ledger: Ledger
  events: Pick<ConversationEvents, 'message'>
  contextWindowOf: ContextWindowOf
}

export interface CompactOptions {
  /** A turn's own input: it stays verbatim, after the fold. */
  inputIds?: readonly string[]
  signal?: AbortSignal
  /** Called once there is something to fold, before the summariser is asked: *Summarise now* returns there. */
  onFold?: () => void
}

export interface Compacted { segmentId: string; message: ConversationMessageView; usage: TurnUsage }

export interface SegmentCompactor extends Compactor {
  compact(conversationId: string, access: ResolvedAccess, reason: 'marks' | 'person', options?: CompactOptions): Promise<Compacted | null>
}

const SUMMARISER_TIMEOUT_MS = 180_000

function sized(message: ConversationMessageView): WindowMessage {
  const lead = asLead(message)
  const base = { seq: message.seq, createdAt: message.createdAt }
  if (!lead || lead.role === 'tool') return { ...base, tokens: 0, side: null }
  return { ...base, tokens: estimateTokens(lead.content), side: lead.role }
}

/** A person's message no turn has taken, or a card still awaiting one: it waits after the fold. */
function waiting(message: ConversationMessageView, awaiting: ReadonlySet<string>, inputIds: readonly string[]): boolean {
  if (inputIds.includes(message.id) || awaiting.has(message.id)) return true
  return message.role === 'PERSON' && message.turnId === null && message.queueState !== 'CANCELLED'
    && (message.kind === 'TEXT' || message.kind === 'APPROVAL_ANSWER')
}

/** What the ledger kept from the span: the entries the head holds that came from it. */
function keptFrom(head: readonly KeptEntry[], range: FoldRange, sinceAt: string | null): string[] {
  return head
    .filter(e => e.sourceSeq !== undefined
      ? e.sourceSeq >= range.firstSeq && e.sourceSeq <= range.lastSeq
      : (sinceAt === null || e.at > sinceAt) && e.at <= range.lastAt)
    .map(entryText)
}

export function createCompactor(deps: CompactorDeps): SegmentCompactor {
  return {
    async due(conversationId, model) {
      const latest = await prisma.conversationSegment.findFirst({ where: { conversationId }, orderBy: { lastSeq: 'desc' }, select: { createdAt: true } })
      // Only a turn that ended after the latest compaction measures the context as it is now.
      const last = await prisma.inferenceTurn.findFirst({
        where: { conversationId, contextTokens: { gt: 0 }, endedAt: latest ? { gt: latest.createdAt } : { not: null } },
        orderBy: { endedAt: 'desc' },
        select: { contextTokens: true },
      })
      return !!last && last.contextTokens > COMPACT_HIGH_MARK * deps.contextWindowOf(model)
    },

    async compact(conversationId, access, reason, options = {}) {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { agentId: true, home: true, projectId: true, taskId: true } })
      const agentId = conversation ? await leadAgentId(conversation) : null
      if (!conversation || !agentId) return null
      const [segments, history, awaiting] = await Promise.all([readSegments(conversationId), readAll(conversationId), awaitingCardIds(conversationId)])
      const window = windowOf(history, segments).sort((a, b) => a.seq - b.seq)
      const inputIds = options.inputIds ?? []
      const stopAtSeq = window.find(m => waiting(m, awaiting, inputIds))?.seq
      const sizes = window.map(sized)
      const low = COMPACT_LOW_MARK * deps.contextWindowOf(access.model)
      // Pressed by the person: what fits under the low mark is kept, but never all of what there is.
      const total = sizes.reduce((sum, m) => sum + m.tokens, 0)
      const range = foldRange(sizes, reason === 'marks' ? low : Math.min(low, COMPACT_LOW_MARK * total), stopAtSeq)
      if (!range) return null
      options.onFold?.()

      const folded = joinedMessages(window.filter(m => range.seqs.includes(m.seq)))
      const system = await leadSystem(conversation, agentId, segments)
      const signal = options.signal ?? AbortSignal.timeout(SUMMARISER_TIMEOUT_MS)
      const answer = await deps.model.complete(summariserRequest({ access, system, folded, conversationId, signal }))
      const { brief, summary } = parseSummariserAnswer(answer.text)

      const head = boundedHead(await deps.ledger.entries(conversationId))
      const previous = segments[segments.length - 1]
      const ledgerKept = keptFrom(head, range, previous?.lastAt ?? null)
      const written = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
        // Another compaction got there first: its segment stands, and this one is not written over it.
        const newest = await tx.conversationSegment.findFirst({ where: { conversationId }, orderBy: { lastSeq: 'desc' }, select: { lastSeq: true } })
        if ((newest?.lastSeq ?? 0) !== (previous?.lastSeq ?? 0)) return null
        const segment = await tx.conversationSegment.create({
          data: {
            conversationId,
            firstSeq: range.firstSeq,
            lastSeq: range.lastSeq,
            firstAt: new Date(range.firstAt),
            lastAt: new Date(range.lastAt),
            brief: sealText(brief),
            summary: sealText(summary),
            ledgerHead: head.map(e => ({ ...e, text: sealText(e.text) })),
          },
          select: { id: true },
        })
        const { message } = await appendMessageIn(tx, {
          conversationId, role: 'PLATFORM', kind: 'SUMMARISED',
          body: { brief, summary, firstSeq: range.firstSeq, lastSeq: range.lastSeq, segmentId: segment.id, ledgerKept },
        })
        return { segmentId: segment.id, message }
      })
      if (!written) return null
      deps.events.message(conversationId, written.message)
      return { ...written, usage: answer.usage }
    },
  }
}
