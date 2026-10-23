/**
 * The summariser's one call (long conversations spec, Compaction in segments): on the conversation's talking model
 * and access, over the very prefix it folds — the same system parts and the same messages the turns sent, which the
 * provider's cache serves — with the instruction behind it. One structured answer: the brief and the full summary.
 */
import type { LeadMessage, LeadRequest, PromptPart } from '../contract'
import { costedFor } from '../../billing/sources/hqCalls'
import { SEGMENT_BRIEF_MAX_TOKENS, SEGMENT_SUMMARY_MAX_TOKENS } from '../../shared/conversations/protocol'

/** About four characters a token. */
export const BRIEF_MAX_CHARS = SEGMENT_BRIEF_MAX_TOKENS * 4
export const SUMMARY_MAX_CHARS = SEGMENT_SUMMARY_MAX_TOKENS * 4
const SUMMARISER_MAX_OUTPUT_TOKENS = SEGMENT_SUMMARY_MAX_TOKENS + 1_000

export const SUMMARISER_INSTRUCTION = `[Written by HQ, not the person: fold the conversation above into one segment of its record.]
Answer with one JSON object and nothing else: {"brief": "...", "summary": "..."}
- brief: one line, at most 35 words: what this stretch of the conversation was about and what it settled.
- summary: at most about 2,000 words: the decisions with their reasons; names, numbers, dates and figures exactly as
  given; what was asked and what was answered; work started and how it ended; obligations taken on; the threads still
  open. Plain sentences and short lists; no preamble.
- Write it from the messages above only. The section "Earlier in this conversation", if there is one, is kept as it
  is: do not repeat it. Where the messages rest on an earlier segment's full summary that was expanded into them, cite
  that segment by its id instead of summarising it again.`

export class SummariserAnswerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SummariserAnswerError'
  }
}

/** The request: the turns' own prefix, a breakpoint at its end, the instruction behind it. */
export function summariserRequest(input: {
  access: LeadRequest['access']
  system: PromptPart[]
  folded: LeadMessage[]
  conversationId: string
  signal: AbortSignal
}): Omit<LeadRequest, 'tools'> {
  return {
    access: costedFor(input.access, 'summary'),
    system: input.system,
    messages: [...input.folded, { role: 'user', content: SUMMARISER_INSTRUCTION }],
    cacheAfterMessage: input.folded.length - 1,
    cacheKey: input.conversationId,
    maxOutputTokens: SUMMARISER_MAX_OUTPUT_TOKENS,
    signal: input.signal,
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The brief and the summary from the answer, each held to its budget; throws when the answer has neither. */
export function parseSummariserAnswer(text: string): { brief: string; summary: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new SummariserAnswerError('The summary came back without its JSON')
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new SummariserAnswerError('The summary came back as JSON that does not parse')
  }
  const { brief, summary } = (parsed ?? {}) as { brief?: unknown; summary?: unknown }
  if (typeof brief !== 'string' || typeof summary !== 'string' || !brief.trim() || !summary.trim()) {
    throw new SummariserAnswerError('The summary came back without a brief or a summary')
  }
  return {
    brief: clip(brief.replace(/\s+/g, ' ').trim(), BRIEF_MAX_CHARS),
    summary: clip(summary.trim(), SUMMARY_MAX_CHARS),
  }
}
