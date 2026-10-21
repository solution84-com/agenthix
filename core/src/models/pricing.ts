import { MODEL_PRICE_TABLE } from './openCodeModels.generated.js'

export interface ModelPricing {
  inputPerMTok: number
  outputPerMTok: number
  /** Cost per 1M tokens read from prompt cache. 0 = provider does not support caching. */
  cacheReadPerMTok: number
  /** Cost per 1M tokens written to prompt cache. 0 = provider does not support caching. */
  cacheWritePerMTok: number
}

/**
 * Price of every model either picker lists, keyed by the model's value on its
 * runtime (bare on Claude, `provider/id` on OpenCode). Built from the pinned
 * catalogue, so it moves with the lists. A model absent from it has no price.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = Object.fromEntries(
  Object.entries(MODEL_PRICE_TABLE).map(([value, [input, output, cacheRead, cacheWrite]]) => [
    value,
    { inputPerMTok: input, outputPerMTok: output, cacheReadPerMTok: cacheRead, cacheWritePerMTok: cacheWrite },
  ]),
)
