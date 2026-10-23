import { describe, expect, it } from 'vitest'
import { MODEL_PRICE_REF, NO_USAGE, VOICE_PRICE_REF } from '@agenthix/core'
import { priceCall } from '../pricing'

const tokens = { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 100_000 }

describe('priceCall @SC-1212', () => {
  it('prices an own key from the catalogue, in whole millionths as a bigint', () => {
    const p = priceCall({ vendor: 'anthropic', model: 'claude-sonnet-4-5', purpose: 'conversation', basis: 'ESTIMATED', usage: tokens }, { usageBilling: false })
    // $3 per million in, $15 per million out.
    expect(p).toEqual({ basis: 'ESTIMATED', amountMicros: 4_500_000n, currency: 'USD', priceRef: MODEL_PRICE_REF })
    expect(typeof p.amountMicros).toBe('bigint')
  })

  it('writes a model with no known price unpriced, with no amount', () => {
    const p = priceCall({ vendor: 'openai_compatible', model: 'local-llama', purpose: 'worker', basis: 'ESTIMATED', usage: tokens }, { usageBilling: false })
    expect(p).toEqual({ basis: 'UNPRICED', amountMicros: null, currency: null, priceRef: null })
  })

  it('writes an answer without usage unpriced', () => {
    const p = priceCall({ vendor: 'anthropic', model: 'claude-sonnet-4-5', purpose: 'worker', basis: 'ESTIMATED', usage: NO_USAGE, hasUsage: false }, { usageBilling: false })
    expect(p.basis).toBe('UNPRICED')
  })

  it('writes a subscription included, with no price', () => {
    const p = priceCall({ vendor: 'anthropic', model: 'claude-sonnet-4-5', purpose: 'worker', basis: 'INCLUDED', usage: tokens }, { usageBilling: true })
    expect(p).toEqual({ basis: 'INCLUDED', amountMicros: null, currency: null, priceRef: null })
  })

  it('prices speech to text per hour of audio and text to speech per character', () => {
    const stt = priceCall({ vendor: 'assemblyai', model: 'u3-rt-pro', purpose: 'stt', basis: 'ESTIMATED', usage: { ...NO_USAGE, audioMs: 3_600_000 } }, { usageBilling: false })
    expect(stt).toEqual({ basis: 'ESTIMATED', amountMicros: 450_000n, currency: 'USD', priceRef: VOICE_PRICE_REF })
    const tts = priceCall({ vendor: 'inworld', model: 'inworld-tts-2', purpose: 'tts', basis: 'ESTIMATED', usage: { ...NO_USAGE, characters: 1000 } }, { usageBilling: false })
    expect(tts.amountMicros).toBe(25_000n)
  })

  describe('through Agenthix Cloud', () => {
    const cloud = { vendor: 'cloud', model: 'anthropic/claude-sonnet-4-5', purpose: 'conversation' as const, basis: 'AWAITING_ACTUAL' as const, usage: tokens }
    const catalogue = { version: '2026-10', prices: () => ({ inputMicros: 4_000_000n, outputMicros: 20_000_000n, cacheReadMicros: 0n, cacheWriteMicros: 0n }) }

    it('awaits the actual cost, with the catalogue price as a guide, while usage billing is on', () => {
      expect(priceCall(cloud, { usageBilling: true, cloudCatalogue: catalogue }))
        .toEqual({ basis: 'AWAITING_ACTUAL', amountMicros: 6_000_000n, currency: 'USD', priceRef: 'cloud-catalogue:2026-10' })
    })

    it('is estimated from the catalogue while usage billing is off', () => {
      expect(priceCall(cloud, { usageBilling: false, cloudCatalogue: catalogue }).basis).toBe('ESTIMATED')
    })

    it('awaits with no amount, or is unpriced, before the catalogue is read', () => {
      expect(priceCall(cloud, { usageBilling: true }).amountMicros).toBeNull()
      expect(priceCall(cloud, { usageBilling: true }).basis).toBe('AWAITING_ACTUAL')
      expect(priceCall(cloud, { usageBilling: false }).basis).toBe('UNPRICED')
    })
  })
})
