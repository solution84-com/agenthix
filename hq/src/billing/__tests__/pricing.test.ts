import { describe, expect, it } from 'vitest'
import { MODEL_PRICE_REF, NO_USAGE, VOICE_PRICE_REF, inworldPriceRef, inworldPricesMicros } from '@agenthix/core'
import { INWORLD_MODELS } from '../../routing/__tests__/inworldFixture'
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
    const stt = priceCall({ vendor: 'assemblyai', model: 'universal-3-6-pro', purpose: 'stt', basis: 'ESTIMATED', usage: { ...NO_USAGE, audioMs: 3_600_000 } }, { usageBilling: false })
    expect(stt).toEqual({ basis: 'ESTIMATED', amountMicros: 450_000n, currency: 'USD', priceRef: VOICE_PRICE_REF })
    const heard = priceCall({ vendor: 'inworld', model: 'inworld/inworld-stt-1', purpose: 'stt', basis: 'ESTIMATED', usage: { ...NO_USAGE, audioMs: 3_600_000 } }, { usageBilling: false })
    expect(heard.amountMicros).toBe(150_000n)
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

describe('priceCall via Inworld @SC-1855', () => {
  const list = INWORLD_MODELS
  const source = { ref: inworldPriceRef(list), prices: (id: string) => { const m = list.find(x => x.id === id); return m ? inworldPricesMicros(m) : null } }
  const options = { usageBilling: false, inworld: source }
  const call = (model: string, usage: typeof tokens) => ({ vendor: 'inworld', model, purpose: 'conversation' as const, basis: 'ESTIMATED' as const, usage })

  it('estimates from the list\'s per-token prices, recorded under the list\'s own reference', () => {
    // $3 per million in, $15 per million out.
    const p = priceCall(call('anthropic/claude-sonnet-5-5', tokens), options)
    expect(p).toEqual({ basis: 'ESTIMATED', amountMicros: 4_500_000n, currency: 'USD', priceRef: source.ref })
    expect(source.ref).toMatch(/^hq:inworld-/)
  })

  it('prices cached input at the cache-read price (prompt tokens include the cached ones)', () => {
    // 10,000 prompt tokens, 6,000 read from cache and 1,000 written: 3,000 plain input.
    const usage = { ...NO_USAGE, inputTokens: 3_000, outputTokens: 500, cacheReadTokens: 6_000, cacheWriteTokens: 1_000 }
    expect(priceCall(call('anthropic/claude-sonnet-5-5', usage), options).amountMicros).toBe(22_050n)
  })

  it('prices an Inworld-hosted model at Inworld\'s own price', () => {
    const p = priceCall(call('inworld/models/deepseek-v4-flash', { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 }), options)
    expect(p.amountMicros).toBe(420_000n)
  })

  it('is unpriced, not free, for a model the list has no price for, or with no list held', () => {
    expect(priceCall(call('mistral/bare-model', tokens), options)).toEqual({ basis: 'UNPRICED', amountMicros: null, currency: null, priceRef: null })
    expect(priceCall(call('anthropic/claude-sonnet-5-5', tokens), { usageBilling: false, inworld: null }).basis).toBe('UNPRICED')
    expect(priceCall(call('anthropic/claude-sonnet-5-5', tokens), { usageBilling: false }).amountMicros).toBeNull()
  })

  it('still prices Inworld\'s speech from the voice list', () => {
    const tts = priceCall({ vendor: 'inworld', model: 'inworld-tts-2', purpose: 'tts', basis: 'ESTIMATED', usage: { ...NO_USAGE, characters: 1000 } }, options)
    expect(tts.priceRef).toBe(VOICE_PRICE_REF)
  })
})
