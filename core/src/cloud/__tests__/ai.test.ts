import { describe, expect, it } from 'vitest'
import {
  CLOUD_USAGE_PAGE_MAX, asksForCloudAiScope, parseCloudAiCatalogue, parseCloudBillingProfilePut, parseCloudSttTokenRequest,
  parseCloudTtsTokenRequest, parseCloudUsagePage, parseCloudVoiceToken, readCloudAiRefusal,
} from '../ai.js'
import { parseCloudConnectError } from '../connection.js'

const CALL = '7f3c2a10-1b2c-4d5e-8f90-123456789abc'

const catalogue = {
  version: '2026-10-23.1',
  currency: 'USD',
  models: [
    {
      maker: 'anthropic', model: 'claude-sonnet-5', name: 'Claude Sonnet 5', apis: ['anthropic'], contextTokens: 200000,
      price: { inputMicros: 2_000_000, outputMicros: 10_000_000, cacheReadMicros: 200_000, cacheWriteMicros: 2_500_000 },
    },
    { maker: 'deepseek', model: 'deepseek/v4', name: 'DeepSeek V4', apis: ['openai'], contextTokens: 128000, price: { inputMicros: 1.5, outputMicros: 1 } },
  ],
  stt: [{ model: 'u3-rt-pro', perHourMicros: 450_000 }, { model: 'bad' }],
  tts: [{ model: 'inworld-tts-1.5-max', perMillionCharsMicros: 10_000_000, voices: [{ id: 'Ashley', name: 'Ashley', language: 'en' }, { id: 'x' }] }],
}

describe('the Cloud AI contract: the catalogue (C2)', () => {
  it('reads a catalogue, dropping entries not in their shape', () => {
    const c = parseCloudAiCatalogue(catalogue)!
    expect(c.version).toBe('2026-10-23.1')
    expect(c.models.map(m => m.model)).toEqual(['claude-sonnet-5'])
    expect(c.stt).toEqual([{ model: 'u3-rt-pro', perHourMicros: 450_000 }])
    expect(c.tts[0].voices).toEqual([{ id: 'Ashley', name: 'Ashley', language: 'en' }])
  })

  it('refuses a catalogue with no version, a currency that is not ISO 4217, or no lists', () => {
    expect(parseCloudAiCatalogue({ ...catalogue, version: '' })).toBeNull()
    expect(parseCloudAiCatalogue({ ...catalogue, currency: 'usd' })).toBeNull()
    expect(parseCloudAiCatalogue({ ...catalogue, stt: undefined })).toBeNull()
    expect(parseCloudAiCatalogue([])).toBeNull()
  })

  it('takes cache prices as 0 when absent, never a fraction or a negative', () => {
    const m = { ...catalogue.models[0], price: { inputMicros: 1, outputMicros: 2 } }
    expect(parseCloudAiCatalogue({ ...catalogue, models: [m] })!.models[0].price).toEqual({ inputMicros: 1, outputMicros: 2, cacheReadMicros: 0, cacheWriteMicros: 0 })
    const neg = { ...catalogue.models[0], price: { inputMicros: -1, outputMicros: 2 } }
    expect(parseCloudAiCatalogue({ ...catalogue, models: [neg] })!.models).toEqual([])
  })
})

describe('the Cloud AI contract: voice tokens (C4, C5)', () => {
  it("Cloud's side reads a token request, with the call id and billing profile only when sent", () => {
    expect(parseCloudSttTokenRequest({ model: 'u3-rt-pro' })).toEqual({ model: 'u3-rt-pro' })
    expect(parseCloudSttTokenRequest({ model: 'u3-rt-pro', callId: CALL, billingProfileId: 'bp-1' }))
      .toEqual({ model: 'u3-rt-pro', callId: CALL, billingProfileId: 'bp-1' })
    expect(parseCloudSttTokenRequest({ model: 'u3-rt-pro', callId: 'no' })).toBeNull()
    expect(parseCloudTtsTokenRequest({ model: 'inworld-tts-1.5-max', voice: 'Ashley' })).toEqual({ model: 'inworld-tts-1.5-max', voice: 'Ashley' })
    expect(parseCloudTtsTokenRequest({ model: 'inworld-tts-1.5-max' })).toBeNull()
  })

  it("hq's side reads a token only for an https or wss address without credentials", () => {
    const token = { token: 'a'.repeat(32), url: 'wss://streaming.example.com/v3', expiresAt: '2026-10-23T10:00:00Z' }
    expect(parseCloudVoiceToken(token)).toEqual({ ...token, expiresAt: '2026-10-23T10:00:00.000Z' })
    expect(parseCloudVoiceToken({ ...token, url: 'http://streaming.example.com' })).toBeNull()
    expect(parseCloudVoiceToken({ ...token, url: 'https://u:p@streaming.example.com' })).toBeNull()
    expect(parseCloudVoiceToken({ ...token, expiresAt: 'soon' })).toBeNull()
    expect(parseCloudVoiceToken({ ...token, token: 'short' })).toBeNull()
  })
})

describe('the Cloud AI contract: actual costs (C6)', () => {
  it('reads a page, counting the entries it drops', () => {
    const page = parseCloudUsagePage({
      entries: [{ callId: CALL, at: '2026-10-23T10:00:00Z', amountMicros: 1234, currency: 'USD' }, { callId: CALL, amountMicros: 1.5 }],
      next: 'cursor-2',
    })!
    expect(page.entries).toEqual([{ callId: CALL, at: '2026-10-23T10:00:00.000Z', amountMicros: 1234, currency: 'USD' }])
    expect(page.dropped).toBe(1)
    expect(page.next).toBe('cursor-2')
  })

  it('refuses a page over the most one may hold, or with a cursor not its shape', () => {
    const entry = { callId: CALL, at: '2026-10-23T10:00:00Z', amountMicros: 1, currency: 'USD' }
    expect(parseCloudUsagePage({ entries: Array(CLOUD_USAGE_PAGE_MAX + 1).fill(entry), next: null })).toBeNull()
    expect(parseCloudUsagePage({ entries: [], next: 'has space' })).toBeNull()
    expect(parseCloudUsagePage({ entries: [], next: null })).toEqual({ entries: [], next: null, dropped: 0 })
  })
})

describe('the Cloud AI contract: billing profiles (C7) and the token scope (C1)', () => {
  it("Cloud's side reads a profile put", () => {
    expect(parseCloudBillingProfilePut('bp-1', { name: 'Client X', archived: false })).toEqual({ id: 'bp-1', name: 'Client X', archived: false })
    expect(parseCloudBillingProfilePut('bp/1', { name: 'Client X', archived: false })).toBeNull()
    expect(parseCloudBillingProfilePut('bp-1', { name: '', archived: false })).toBeNull()
    expect(parseCloudBillingProfilePut('bp-1', { name: 'X' })).toBeNull()
  })

  it('asks for the ai scope, and invalid_scope is read as an RFC 6749 error', () => {
    expect(asksForCloudAiScope({ scope: 'ai' })).toBe(true)
    expect(asksForCloudAiScope({ scope: 'other ai' })).toBe(true)
    expect(asksForCloudAiScope({})).toBe(false)
    expect(parseCloudConnectError({ error: 'invalid_scope' })).toEqual({ error: 'invalid_scope' })
  })
})

describe('the Cloud AI contract: refusals (X1–X4)', () => {
  it("reads Cloud's own refusals only with their status", () => {
    expect(readCloudAiRefusal(403, { error: 'not_available' })).toEqual({ error: 'not_available' })
    expect(readCloudAiRefusal(404, { error: 'model_not_offered' })).toEqual({ error: 'model_not_offered' })
    expect(readCloudAiRefusal(401, { error: 'invalid_client' })).toEqual({ error: 'disconnected' })
    expect(readCloudAiRefusal(500, { error: 'not_available' })).toBeNull()
  })

  it("reads the spending limit at the top, or inside the vendor's own error shape from the gateway", () => {
    const cap = { error: 'cap_reached', scope: 'billing_profile', resetsAt: '2026-11-01T00:00:00Z' }
    const read = { error: 'cap_reached', scope: 'billing_profile', resetsAt: '2026-11-01T00:00:00.000Z' }
    expect(readCloudAiRefusal(402, cap)).toEqual(read)
    expect(readCloudAiRefusal(402, { type: 'error', error: { type: 'billing_error', message: 'limit', cloud_error: cap } })).toEqual(read)
    expect(readCloudAiRefusal(402, { error: { message: 'limit' }, cloud_error: cap })).toEqual(read)
    expect(readCloudAiRefusal(402, { ...cap, scope: 'project' })).toBeNull()
  })

  it("leaves a vendor's own error, a 429 and a 426 to be read as today", () => {
    expect(readCloudAiRefusal(429, { error: { type: 'rate_limit_error' } })).toBeNull()
    expect(readCloudAiRefusal(426, { error: 'unsupported_protocol_version' })).toBeNull()
    expect(readCloudAiRefusal(401, { error: { type: 'authentication_error' } })).toBeNull()
  })
})
