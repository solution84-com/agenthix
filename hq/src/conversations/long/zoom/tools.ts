/**
 * The lead's zoom tools (long conversations spec, Zooming in): `expand` and `messages` read the conversation's
 * own compacted past from the record, and `offer_new_conversation` writes the one-line offer the screen shows.
 * They have no operation of their own: the answer is tied to the turn that asked, like the memory tools.
 */
import { z } from 'zod'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { expandSegments } from './expand'
import { pageOfSpan } from './readSpan'
import { tokensOf, type SegmentRecord } from './spans'

export interface ZoomDeps {
  /** The conversation's segments, oldest first, opened. */
  segments(conversationId: string): Promise<SegmentRecord[]>
  /** Whether anything in the conversation has been folded into a segment. */
  folded(conversationId: string): Promise<boolean>
  /** The messages of a span, oldest first. */
  messagesIn(conversationId: string, firstSeq: number, lastSeq: number): Promise<ConversationMessageView[]>
  /** How many tokens the window can still take before the high mark. */
  roomTokens(capability: TurnCapability): Promise<number>
  /** Writes the offer line into the conversation. */
  offerNewConversation(capability: TurnCapability, about: string): Promise<void>
}

const done = (capability: TurnCapability, result: unknown): ToolCallOutcome => ({ status: 'done', operationId: capability.turnId, result })
const refused = (reason: string): ToolCallOutcome => ({ status: 'refused', reason })

function usable(capability: TurnCapability): boolean {
  return capability.trigger !== 'REPORT' && capability.expiresAt > Date.now()
}

const expandInput = z.object({
  segments: z.union([z.literal('all'), z.array(z.string().min(1)).min(1).max(100)])
    .describe('The ids of the segments to expand (one or several), or "all"'),
})
const messagesInput = z.object({
  segment: z.string().min(1).describe('The segment whose exact words you want'),
  page: z.number().int().min(1).optional().describe('Which page, from 1; the result says how many there are'),
})
const offerInput = z.object({
  about: z.string().min(1).max(200).describe('What the new conversation would be about, in a few words'),
})

function badArguments(tool: string, error: z.ZodError): ToolCallOutcome {
  return refused(`The arguments do not fit ${tool}: ${error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`)
}

/** What expansions already added to a turn's context, so a second call in the same turn sees the room left. */
const SPENT_TURNS_KEPT = 200

export function createZoomTools(deps: ZoomDeps): ConversationTool[] {
  const spent = new Map<string, number>()
  const roomFor = async (capability: TurnCapability) => Math.max(0, (await deps.roomTokens(capability)) - (spent.get(capability.turnId) ?? 0))
  const spend = (capability: TurnCapability, tokens: number) => {
    spent.set(capability.turnId, (spent.get(capability.turnId) ?? 0) + tokens)
    if (spent.size > SPENT_TURNS_KEPT) spent.delete(spent.keys().next().value as string)
  }
  // Offered only once something is folded; a conversation whose segments cannot be read has nothing to zoom into.
  const offered = async (capability: TurnCapability) => usable(capability) && (await deps.folded(capability.conversationId).catch(() => false))
  return [
    {
      name: 'expand',
      area: 'conversation',
      describe: async () => 'Read the full summary of folded segments: one, several or all. What does not fit is named, not cut.',
      input: expandInput,
      offered,
      async run(capability, input) {
        if (!usable(capability)) return refused('expand is not available in this reply')
        const parsed = expandInput.safeParse(input)
        if (!parsed.success) return badArguments('expand', parsed.error)
        const segments = await deps.segments(capability.conversationId)
        if (segments.length === 0) return refused('This conversation has not been compacted: everything is still in front of you.')
        const result = expandSegments(segments, parsed.data.segments, await roomFor(capability))
        spend(capability, result.expanded.reduce((n, e) => n + tokensOf(e.summary), 0))
        return done(capability, result)
      },
    },
    {
      name: 'messages',
      area: 'conversation',
      describe: async () => 'Read the exact words of one folded segment, a page at a time. The result says what remains.',
      input: messagesInput,
      offered,
      async run(capability, input) {
        if (!usable(capability)) return refused('messages is not available in this reply')
        const parsed = messagesInput.safeParse(input)
        if (!parsed.success) return badArguments('messages', parsed.error)
        const segment = (await deps.segments(capability.conversationId)).find(s => s.id === parsed.data.segment)
        if (!segment) return refused(`No such segment: ${parsed.data.segment}`)
        const record = await deps.messagesIn(capability.conversationId, segment.firstSeq, segment.lastSeq)
        return done(capability, pageOfSpan(segment, record, parsed.data.page ?? 1))
      },
    },
    {
      name: 'offer_new_conversation',
      area: 'conversation',
      describe: async () => 'Offer the person, in one line on screen, a new conversation for a subject far from this one.',
      input: offerInput,
      // The offer needs a person to read it; a turn that answers no one has none.
      offered: async capability => usable(capability) && capability.trigger !== 'CONTINUATION',
      async run(capability, input) {
        if (!usable(capability)) return refused('offer_new_conversation is not available in this reply')
        const parsed = offerInput.safeParse(input)
        if (!parsed.success) return badArguments('offer_new_conversation', parsed.error)
        await deps.offerNewConversation(capability, parsed.data.about.trim())
        return done(capability, { offered: true, note: 'The person sees the offer as one line. Carry on with their message; do not repeat it.' })
      },
    },
  ]
}
