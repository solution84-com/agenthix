/**
 * A model via Inworld in the resolver (unit one-key, phase 5): reached from the list held, the same model as at its
 * maker for lists and for "the same model via another provider", skipped when Inworld is not working, and nothing
 * listed while no list is held.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResolveRequest } from '@agenthix/core'
import { decide, sameModelElsewhere, usableModels, whyUnusable, type Layers, type RouteProvider, type Snapshot } from '../decide'
import { allowedByLists, type AppliedList } from '../listMatch'
import { clearInworldLists, inworldListState, inworldPricesOf, setInworldList } from '../inworldModelStore'
import { makerAndName, modelsReachedBy, reaches, sameModelKey } from '../modelKeys'
import { INWORLD_MODELS } from './inworldFixture'

const provider = (id: string, vendor: RouteProvider['vendor'], state: RouteProvider['state'] = 'works'): RouteProvider =>
  ({ id, name: vendor, vendor, credentialKind: 'api_key', state, ownerUserId: null, types: vendor === 'inworld' ? ['llm', 'stt', 'tts'] : undefined })
const ant = provider('p-ant', 'anthropic')
const iw = provider('p-iw', 'inworld')
const NONE: Layers = { conversation: null, stt: null, tts: null }
const snap = (providers: RouteProvider[], over: Partial<Snapshot> = {}): Snapshot =>
  ({ providers, org: NONE, agent: null, agentName: null, lists: [], conversationModel: null, billingProfileId: 'bp', ...over })
const req = (over: Partial<ResolveRequest> = {}): ResolveRequest => ({ purpose: 'conversation', place: { kind: 'organisation' }, ...over })

const SONNET = 'anthropic/claude-sonnet-5-5'
const HOSTED = 'inworld/models/deepseek-v4-flash'

beforeEach(() => clearInworldLists())
afterEach(() => clearInworldLists())

describe('what Inworld reaches @SC-1854', () => {
  it('is nothing, and says why, until a list is read', () => {
    expect(modelsReachedBy('inworld')).toEqual([])
    expect(inworldListState('p-iw')).toBe('not_read_yet')
    expect(reaches('inworld', SONNET)).toBe(false)
  })

  it('is the list held: ids as listed, a label from the id, a cost rank from the price, no date', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const reached = modelsReachedBy('inworld')
    expect(reached.map(m => m.model)).toEqual([
      SONNET, 'anthropic/claude-sonnet-5', 'anthropic/claude-haiku-5-5', HOSTED, 'google-ai-studio/gemini-3-1-pro', 'openai/gpt-5.4-nano', 'mistral/bare-model',
    ])
    const sonnet = reached[0]
    expect(sonnet.label).toBe('Claude Sonnet 5.5')
    expect(sonnet.costRank).toBeGreaterThan(reached[2].costRank!)
    expect(sonnet).not.toHaveProperty('releasedAt')
    expect(reached.find(m => m.model === 'mistral/bare-model')!.costRank).toBeNull()
    expect(inworldListState('p-iw')).toBeNull()
    expect(reaches('inworld', SONNET)).toBe(true)
  })

  it('passes a release date through for the catalogue providers @SC-1861', () => {
    expect(modelsReachedBy('anthropic').every(m => /^\d{4}-\d{2}-\d{2}$/.test(m.releasedAt ?? ''))).toBe(true)
  })
})

describe('the same model, whoever serves it @SC-1854', () => {
  it('has one key at Inworld and at its maker', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    expect(sameModelKey('inworld', SONNET)).toBe(sameModelKey('anthropic', 'claude-sonnet-5-5'))
    expect(sameModelKey('inworld', 'google-ai-studio/gemini-3-1-pro')).toBe(sameModelKey('google', 'gemini-3.1-pro'))
    expect(makerAndName('inworld', HOSTED)).toBe('deepseek/deepseek-v4-flash')
    expect(sameModelKey('inworld', HOSTED)).toBe(sameModelKey('openrouter', 'deepseek/deepseek-v4-flash'))
  })

  it('lets a pattern by maker match the model on both providers', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const only = (...allow: string[]): AppliedList[] => [{ mode: 'only_these', entries: allow.map(pattern => ({ effect: 'allow' as const, pattern })) }]
    const never = (pattern: string): AppliedList[] => [{ mode: 'every', entries: [{ effect: 'never', pattern }] }]
    for (const [vendor, model] of [['inworld', SONNET], ['anthropic', 'claude-sonnet-5-5']] as const) {
      expect(allowedByLists(only('anthropic/*'), makerAndName(vendor, model))).toBe(true)
      expect(allowedByLists(never('anthropic/*'), makerAndName(vendor, model))).toBe(false)
    }
    expect(allowedByLists(only('google/*'), makerAndName('inworld', 'google-ai-studio/gemini-3-1-pro'))).toBe(true)
    expect(allowedByLists(only('google/*'), makerAndName('google', 'gemini-3.1-pro'))).toBe(true)
    expect(allowedByLists(only('deepseek/*'), makerAndName('inworld', HOSTED))).toBe(true)
    expect(allowedByLists(only('deepseek/*'), makerAndName('inworld', SONNET))).toBe(false)
  })
})

describe('the resolver with Inworld', () => {
  it('offers a model via Inworld like any provider\'s, and lists obey it @SC-1854', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const s = snap([iw])
    expect(usableModels(req(), s).map(c => c.model)).toContain(SONNET)
    const banned = snap([iw], { lists: [{ mode: 'every', entries: [{ effect: 'never', pattern: 'anthropic/*' }] }] })
    expect(usableModels(req(), banned).map(c => c.model)).not.toContain(SONNET)
    expect(usableModels(req(), banned).map(c => c.model)).toContain(HOSTED)
    expect(whyUnusable({ providerId: 'p-iw', model: SONNET }, req(), banned)?.code).toBe('model_not_allowed')
  })

  it('takes the organisation\'s default via Inworld, costed as an estimate from the list @SC-1855', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const answer = decide(req(), snap([iw], { org: { ...NONE, conversation: { providerId: 'p-iw', model: SONNET } } }))
    expect(answer).toMatchObject({ ok: true, resolution: { vendor: 'inworld', basis: 'ESTIMATED', runtime: null, model: { model: SONNET } } })
    const worker = decide(req({ purpose: 'worker' }), snap([iw], { org: { ...NONE, conversation: { providerId: 'p-iw', model: SONNET } } }))
    expect(worker).toMatchObject({ ok: true, resolution: { runtime: 'opencode' } })
  })

  it('writes a model with no price in the list as unpriced @SC-1855', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const pick = { providerId: 'p-iw', model: 'mistral/bare-model' }
    expect(decide(req({ pick }), snap([iw]))).toMatchObject({ ok: true, resolution: { basis: 'UNPRICED' } })
    expect(inworldPricesOf('mistral/bare-model')).toBeNull()
  })

  it('refuses a choice via Inworld while no list is read: the model is not reached, not an outage', () => {
    const answer = decide(req({ pick: { providerId: 'p-iw', model: SONNET } }), snap([iw]))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'model_not_reached' } })
  })

  it('offers a conversation fixed to a model the same model via another provider when Inworld fails, and the other way', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    // The pinned catalogue lags Inworld's list (no Sonnet 5.5 at Anthropic yet), so the shared model is Sonnet 5.
    const fixed = { providerId: 'p-iw', model: 'anthropic/claude-sonnet-5' }
    expect(sameModelElsewhere(fixed, req(), snap([iw, ant]))).toEqual({ providerId: 'p-ant', model: 'claude-sonnet-5' })
    expect(sameModelElsewhere({ providerId: 'p-ant', model: 'claude-sonnet-5' }, req(), snap([iw, ant]))).toEqual(fixed)
    for (const state of ['key_refused', 'out_of_credit', 'unreachable'] as const) {
      const down = snap([provider('p-iw', 'inworld', state), ant])
      expect(whyUnusable(fixed, req(), down)?.code).toBe('provider_not_working')
      expect(sameModelElsewhere(fixed, req(), down)).toEqual({ providerId: 'p-ant', model: 'claude-sonnet-5' })
      expect(sameModelElsewhere({ providerId: 'p-ant', model: 'claude-sonnet-5' }, req(), down)).toBeNull()
    }
  })

  it('falls from a default via a provider that is down to the same model via Inworld', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const s = snap([provider('p-ant', 'anthropic', 'key_refused'), iw], { org: { ...NONE, conversation: { providerId: 'p-ant', model: 'claude-sonnet-5' } } })
    const answer = decide(req(), s)
    expect(answer).toMatchObject({ ok: true, resolution: { model: { providerId: 'p-iw', model: 'anthropic/claude-sonnet-5' }, fellBack: expect.anything() } })
  })

  it('offers nothing via Inworld when its language-model type is off', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const off = { ...iw, types: ['stt' as const, 'tts' as const] }
    expect(usableModels(req(), snap([off]))).toEqual([])
    expect(whyUnusable({ providerId: 'p-iw', model: SONNET }, req(), snap([off]))?.code).toBe('model_not_reached')
  })
})
