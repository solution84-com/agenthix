/**
 * The price a ledger row is written with, fixed when it is written (part 5, *The price list*): hq's own lists on the
 * organisation's keys (`hq:<version>`), Agenthix Cloud's catalogue through Cloud (`cloud-catalogue:<version>`), nothing
 * for a person's own subscription, and nothing for a model with no known price. No price is ever entered by hand.
 */
import {
  MODEL_PRICE_REF, PRICE_LIST_CURRENCY, VOICE_PRICE_REF, audioCostMicros, characterCostMicros, cloudCataloguePriceRef,
  modelPricesMicros, sttPricePerHourMicros, tokenCostMicros, ttsPricePerMillionCharsMicros,
  type CallUsage, type CostBasis, type TokenPricesMicros, type UsagePurpose,
} from '@agenthix/core'

export type Price = { basis: CostBasis; amountMicros: bigint | null; currency: string | null; priceRef: string | null }

/** Agenthix Cloud's catalogue, once hq has read it: its version and a model's prices in it. */
export type CloudCatalogue = { version: string; prices: (model: string) => TokenPricesMicros | null }

export type PricingOptions = {
  /** The `usageBilling` flag: Cloud reports actual costs, so its calls await them. */
  usageBilling: boolean
  cloudCatalogue?: CloudCatalogue | null
}

export type PriceInput = {
  vendor: string
  model: string
  purpose: UsagePurpose
  /** The resolver's basis, which says a subscription or Cloud; an own key is priced here or not at all. */
  basis: CostBasis
  usage: CallUsage
  hasUsage?: boolean
}

const NONE = { amountMicros: null, currency: null, priceRef: null }

function ownKeyPrice(input: PriceInput): Price {
  const { vendor, model, purpose, usage } = input
  if (purpose === 'stt') {
    const perHour = sttPricePerHourMicros(vendor, model)
    if (perHour !== null) return { basis: 'ESTIMATED', amountMicros: audioCostMicros(perHour, usage.audioMs), currency: PRICE_LIST_CURRENCY, priceRef: VOICE_PRICE_REF }
  } else if (purpose === 'tts') {
    const perMillion = ttsPricePerMillionCharsMicros(vendor, model)
    if (perMillion !== null) return { basis: 'ESTIMATED', amountMicros: characterCostMicros(perMillion, usage.characters), currency: PRICE_LIST_CURRENCY, priceRef: VOICE_PRICE_REF }
  } else {
    const prices = modelPricesMicros(vendor, model)
    if (prices) return { basis: 'ESTIMATED', amountMicros: tokenCostMicros(prices, usage), currency: PRICE_LIST_CURRENCY, priceRef: MODEL_PRICE_REF }
  }
  return { basis: 'UNPRICED', ...NONE }
}

function cloudPrice(input: PriceInput, options: PricingOptions): Price {
  const catalogue = options.cloudCatalogue ?? null
  const prices = catalogue?.prices(input.model) ?? null
  const guide = catalogue && prices
    ? { amountMicros: tokenCostMicros(prices, input.usage), currency: PRICE_LIST_CURRENCY, priceRef: cloudCataloguePriceRef(catalogue.version) }
    : NONE
  // Cloud reports its own figure later only while usage billing is on; otherwise its catalogue is the estimate.
  if (options.usageBilling) return { basis: 'AWAITING_ACTUAL', ...guide }
  return guide.amountMicros === null ? { basis: 'UNPRICED', ...NONE } : { basis: 'ESTIMATED', ...guide }
}

export function priceCall(input: PriceInput, options: PricingOptions): Price {
  if (input.basis === 'INCLUDED') return { basis: 'INCLUDED', ...NONE }
  if (input.hasUsage === false) return { basis: 'UNPRICED', ...NONE }
  if (input.basis === 'AWAITING_ACTUAL' || input.vendor === 'cloud') return cloudPrice(input, options)
  return ownKeyPrice(input)
}
