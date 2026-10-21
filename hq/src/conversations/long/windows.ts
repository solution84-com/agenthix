/**
 * The models' context windows, in tokens, for the marks of compaction (long conversations spec, Budgets). Matched on
 * the model's own name, whichever provider routes it (`claude-sonnet-5`, `openrouter/anthropic/claude-sonnet-5`). A
 * model not listed gets a small window: compacting early costs one summariser call, overflowing costs the turn.
 */
import type { ContextWindowOf } from '../contract'

export const DEFAULT_CONTEXT_WINDOW = 32_000

const WINDOWS: readonly [RegExp, number][] = [
  [/claude/, 200_000],
  [/gemini-(2\.5|[3-9])/, 1_000_000],
  [/gpt-4\.1/, 1_000_000],
  [/gpt-5/, 400_000],
  [/(^|\/)o[34](-|$)/, 200_000],
  [/gpt-4o/, 128_000],
  [/deepseek/, 128_000],
]

export const contextWindowOf: ContextWindowOf = (model) => {
  const name = model.toLowerCase()
  return WINDOWS.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_CONTEXT_WINDOW
}

/** About four characters a token: the measure for what is about to be sent, before a provider counts it. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)
