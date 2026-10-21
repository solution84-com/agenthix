/**
 * Long conversations (conversational experience spec, Long conversations; phase 4): the marks and budgets of
 * compaction, a segment as the screen opens it, and *Summarise now*. Re-exported from protocol.ts. Client-safe.
 */

/** Compact when the context passes this share of the model's window, folding everything older than the low mark. */
export const COMPACT_HIGH_MARK = 0.7
export const COMPACT_LOW_MARK = 0.3
/** Budgets, in tokens (about four characters each). */
export const SEGMENT_BRIEF_MAX_TOKENS = 50
export const SEGMENT_SUMMARY_MAX_TOKENS = 3_000
export const LEDGER_HEAD_MAX_TOKENS = 1_500
export const MESSAGES_PAGE_TOKENS = 2_000

/** One compaction as the screen opens it: the brief in the marker, the full summary on opening it. */
export type ConversationSegmentView = {
  id: string
  firstSeq: number
  lastSeq: number
  firstAt: string
  lastAt: string
  brief: string
  summary: string
}
export type GetConversationSegmentArgs = { conversationId: string; segmentId: string }
export type SummariseNowArgs = { conversationId: string }
