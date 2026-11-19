/**
 * The hum service's purpose, `backchannel` (adaptive voice listening, spec §The backchannel): a branch of its own beside
 * the light model's, from its own short list of fast models, DeepSeek Flash first where a provider reaches it; never the
 * agent's or the conversation's model, never a person's own subscription; with none, a problem (the page then plays plain
 * continuers).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { ResolveRequest } from '@agenthix/core'
import { decide, type Layers, type RouteProvider, type Snapshot } from '../decide'
import { clearInworldLists, setInworldList } from '../inworldModelStore'
import { BACKCHANNEL_MODELS } from '../listener'
import { INWORLD_MODELS } from './inworldFixture'

const anthropic: RouteProvider = { id: 'p-ant', name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const openrouter: RouteProvider = { id: 'p-or', name: 'OpenRouter', vendor: 'openrouter', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const inworld: RouteProvider = { id: 'p-iw', name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const google: RouteProvider = { id: 'p-goo', name: 'Google', vendor: 'google', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const sub: RouteProvider = { id: 'p-sub', name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', state: 'works', ownerUserId: 'u1' }

const NONE: Layers = { conversation: null, stt: null, tts: null }
const sonnet = { providerId: 'p-ant', model: 'claude-sonnet-4-5' }

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  providers: [anthropic, openrouter], org: { ...NONE, conversation: sonnet }, agent: { ...NONE, conversation: sonnet },
  agentName: 'Kernel', lists: [], conversationModel: sonnet, billingProfileId: 'bp-default', ...over,
})
const req = (over: Partial<ResolveRequest> = {}): ResolveRequest =>
  ({ purpose: 'backchannel', place: { kind: 'project', projectId: 'pr1' }, conversationId: 'c1', ...over })

beforeEach(() => clearInworldLists())

describe('decide: the hum service, purpose backchannel @SC-2228', () => {
  it("takes a fast model from its own list, never the agent's or the conversation's model", () => {
    const answer = decide(req(), snap())
    expect(answer.ok && answer.resolution).toMatchObject({ purpose: 'backchannel', model: { providerId: 'p-ant', model: 'claude-haiku-4-5' }, from: 'organisation' })
  })

  it('takes DeepSeek Flash, the baseline, first on OpenRouter and on Inworld', () => {
    expect(BACKCHANNEL_MODELS.openrouter?.[0]).toBe('~deepseek/deepseek-flash-latest')
    const or = decide(req(), snap({ providers: [openrouter] }))
    expect(or.ok && or.resolution.model).toEqual({ providerId: 'p-or', model: '~deepseek/deepseek-flash-latest' })
    setInworldList('p-iw', INWORLD_MODELS)
    const iw = decide(req(), snap({ providers: [openrouter, inworld] }))
    expect(iw.ok && iw.resolution.model).toEqual({ providerId: 'p-iw', model: 'inworld/models/deepseek-v4-flash' })
  })

  it('never takes a person\'s own subscription, and with no fast model says so', () => {
    const answer = decide(req({ place: { kind: 'own', userId: 'u1' } }), snap({ providers: [sub, google] }))
    expect(answer.ok).toBe(false)
    if (!answer.ok) expect(answer.problem.message).toMatch(/hum/)
  })
})
