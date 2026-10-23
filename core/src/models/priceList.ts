/**
 * hq's price list for models on the organisation's own keys: the pinned catalogue (`openCodeModels.generated.ts`, from
 * OpenCode's model list), converted once to whole millionths of a US dollar per million tokens. Its version is the
 * catalogue's, so a ledger row's `hq:<version>` names exactly the prices it used, and it moves whenever the catalogue
 * is regenerated. A model absent from it has no known price, and its calls are unpriced: no price is ever entered by
 * hand.
 */
import { MODEL_PRICE_TABLE, OPENCODE_CATALOGUE_VERSION } from './openCodeModels.generated.js'
import { hqPriceRef, unitsToMicros, type PriceRef, type TokenPricesMicros } from '../billing/ledger.js'

export const MODEL_PRICE_LIST_VERSION = `opencode-${OPENCODE_CATALOGUE_VERSION}`
export const MODEL_PRICE_REF: PriceRef = hqPriceRef(MODEL_PRICE_LIST_VERSION)

/**
 * A model's prices at a vendor, by the model as that vendor names it (`claude-sonnet-5` at `anthropic`,
 * `deepseek/deepseek-v3.2` at `openrouter`): the catalogue's `<vendor>/<model>`. Null when the catalogue has no price
 * for it, which is always so for an OpenAI-compatible endpoint, a voice vendor and Agenthix Cloud (whose prices come
 * from its own catalogue).
 */
export function modelPricesMicros(vendor: string, model: string): TokenPricesMicros | null {
  const row = MODEL_PRICE_TABLE[`${vendor}/${model}`]
  if (!row) return null
  const [input, output, cacheRead, cacheWrite] = row
  return {
    inputMicros: unitsToMicros(input),
    outputMicros: unitsToMicros(output),
    cacheReadMicros: unitsToMicros(cacheRead),
    cacheWriteMicros: unitsToMicros(cacheWrite),
  }
}
