import { describe, expect, it } from 'vitest'
import {
  audioCostMicros, characterCostMicros, cloudCataloguePriceRef, hqPriceRef, isCallId, parsePriceRef, parseWireMicros,
  tokenCostMicros, unitsToMicros,
} from '../ledger.js'
import { MODEL_PRICE_LIST_VERSION, MODEL_PRICE_REF, modelPricesMicros } from '../../models/priceList.js'
import { OPENCODE_CATALOGUE_VERSION } from '../../models/openCodeModels.generated.js'
import { VOICE_PRICE_REF, sttPricePerHourMicros, ttsPricePerMillionCharsMicros } from '../../models/voicePrices.js'

describe('money in the ledger', () => {
  it('converts a list price to whole millionths once, rounding to the nearest', () => {
    expect(unitsToMicros(3)).toBe(3_000_000n)
    expect(unitsToMicros(0.53856)).toBe(538_560n)
    expect(unitsToMicros(0.0000004)).toBe(0n)
  })

  it('costs tokens at their price per million, summed and rounded once', () => {
    const prices = { inputMicros: 3_000_000n, outputMicros: 15_000_000n, cacheReadMicros: 300_000n, cacheWriteMicros: 3_750_000n }
    expect(tokenCostMicros(prices, { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 })).toBe(11_100n)
    // 1 token at $3 per million is 3 millionths; 1 cache-read token at $0.30 is 0.3, which rounds with the rest.
    expect(tokenCostMicros(prices, { inputTokens: 1, outputTokens: 0, cacheReadTokens: 1, cacheWriteTokens: 0 })).toBe(3n)
    expect(tokenCostMicros(prices, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 5, cacheWriteTokens: 0 })).toBe(2n)
  })

  it('costs audio per hour and speech per million characters', () => {
    expect(audioCostMicros(450_000n, 60 * 60_000)).toBe(450_000n)
    expect(audioCostMicros(150_000n, 60_000)).toBe(2_500n)
    expect(characterCostMicros(10_000_000n, 1234)).toBe(12_340n)
  })

  it('reads money on the wire as whole safe integers only', () => {
    expect(parseWireMicros(1234)).toBe(1234)
    expect(parseWireMicros(-5)).toBeNull()
    expect(parseWireMicros(-5, true)).toBe(-5)
    for (const bad of [1.5, '12', Number.MAX_SAFE_INTEGER + 1, NaN, null]) expect(parseWireMicros(bad)).toBeNull()
  })

  it('names each price it used', () => {
    expect(hqPriceRef('voice-2026-10-23')).toBe('hq:voice-2026-10-23')
    expect(parsePriceRef(cloudCataloguePriceRef('v7'))).toBe('cloud-catalogue:v7')
    expect(parsePriceRef('cloud-actual')).toBe('cloud-actual')
    expect(parsePriceRef('hand-entered:1')).toBeNull()
    expect(isCallId('7f3c2a10-1b2c-4d5e-8f90-123456789abc')).toBe(true)
    expect(isCallId('short')).toBe(false)
  })
})

describe("hq's price lists", () => {
  it("versions the model prices by the catalogue's version", () => {
    expect(MODEL_PRICE_LIST_VERSION).toBe(`opencode-${OPENCODE_CATALOGUE_VERSION}`)
    expect(MODEL_PRICE_REF).toBe(`hq:opencode-${OPENCODE_CATALOGUE_VERSION}`)
  })

  it('prices a model by the vendor that serves it and its name there; one with no price is unpriced', () => {
    expect(modelPricesMicros('anthropic', 'claude-sonnet-5')).toEqual({
      inputMicros: 2_000_000n, outputMicros: 10_000_000n, cacheReadMicros: 200_000n, cacheWriteMicros: 2_500_000n,
    })
    expect(modelPricesMicros('openrouter', 'anthropic/claude-sonnet-5')).not.toBeNull()
    expect(modelPricesMicros('openai_compatible', 'llama3')).toBeNull()
    expect(modelPricesMicros('cloud', 'claude-sonnet-5')).toBeNull()
  })

  it('prices voice by its own hand-kept list', () => {
    expect(VOICE_PRICE_REF).toMatch(/^hq:voice-\d{4}-\d{2}-\d{2}(\.\d+)?$/)
    expect(sttPricePerHourMicros('assemblyai', 'universal-streaming-english')).toBe(150_000n)
    expect(ttsPricePerMillionCharsMicros('inworld', 'inworld-tts-2')).toBe(25_000_000n)
    expect(ttsPricePerMillionCharsMicros('inworld', 'inworld-tts-1.5-max')).toBeNull()
    expect(sttPricePerHourMicros('assemblyai', 'unknown')).toBeNull()
  })
})
