import type { LanguageModelUsage } from 'ai'
import type { TurnUsage } from '../contract'

/**
 * `inputTokens` is the input that was neither read from nor written to the cache, so the four counts add up to
 * what the call used and each is priced once. A provider that reports only a total counts all of it as input.
 */
export function turnUsageOf(usage: LanguageModelUsage | undefined): TurnUsage {
  const cacheRead = usage?.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWrite = usage?.inputTokenDetails?.cacheWriteTokens ?? 0
  const total = usage?.inputTokens ?? 0
  const fresh = usage?.inputTokenDetails?.noCacheTokens ?? Math.max(0, total - cacheRead - cacheWrite)
  return { inputTokens: fresh, outputTokens: usage?.outputTokens ?? 0, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }
}
