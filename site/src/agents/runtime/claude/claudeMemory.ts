/**
 * Claude Code's memory of a conversation, as its SDK reports it:
 *
 * - Summarising: a `system` message `compact_boundary` with its trigger
 *   (`manual` for `/compact`, `auto` on its own) and the tokens before; the
 *   summary itself arrives in the `PostCompact` hook's `compact_summary`.
 * - How full it is: `getContextUsage()` — `totalTokens` now, the point it
 *   summarises at (`autoCompactThreshold`, else `maxTokens` when automatic
 *   summarising is on) and the model's window (`rawMaxTokens`). When that call
 *   is not answered, the last model response's tokens against the result's
 *   `modelUsage[].contextWindow`.
 */
import type { ContextUse } from '@agenthix/core'

type Message = { type?: unknown; subtype?: unknown; [key: string]: unknown }

export type Compaction = { trigger: 'auto' | 'manual'; tokensBefore: number | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function compactionOf(message: Message): Compaction | null {
  if (message.type !== 'system' || message.subtype !== 'compact_boundary') return null
  const meta = (message.compact_metadata ?? {}) as { trigger?: unknown; pre_tokens?: unknown }
  return { trigger: meta.trigger === 'manual' ? 'manual' : 'auto', tokensBefore: num(meta.pre_tokens) }
}

/** The answer of `getContextUsage()`, or null when it says too little. */
export function contextUseOfUsage(usage: unknown, at: Date): ContextUse | null {
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const tokens = num(u.totalTokens)
  const window = num(u.rawMaxTokens) ?? num(u.maxTokens)
  if (tokens === null || !window) return null
  const summarisesAt = num(u.autoCompactThreshold) ?? (u.isAutoCompactEnabled === true ? num(u.maxTokens) : null)
  return { tokens, summarisesAt, window, at: at.toISOString() }
}

/** What the conversation holds after a model response: everything it was sent, and what it said. */
export function tokensOfAssistant(message: Message): number | null {
  if (message.type !== 'assistant') return null
  const usage = (message.message as { usage?: Record<string, unknown> } | undefined)?.usage
  if (!usage) return null
  const parts = [usage.input_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens, usage.output_tokens].map(num)
  return parts.some(p => p !== null) ? parts.reduce<number>((sum, p) => sum + (p ?? 0), 0) : null
}

/** From a turn's result: the model's window, with the last response's tokens. */
export function contextUseOfResult(result: Message, lastTokens: number | null, model: string, at: Date): ContextUse | null {
  if (lastTokens === null) return null
  const usage = (result.modelUsage ?? {}) as Record<string, { contextWindow?: unknown }>
  const entry = usage[model] ?? Object.values(usage)[0]
  const window = num(entry?.contextWindow)
  return window ? { tokens: lastTokens, summarisesAt: null, window, at: at.toISOString() } : null
}
