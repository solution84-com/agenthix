/**
 * The light model's purpose, `listener` (adaptive voice listening, spec §Which light model, and its cost): its own
 * branch, never the agent's conversation model; an Inworld-routed fast model first when the organisation has Inworld,
 * then each provider's fast model from a short list; within the lists; never a person's own subscription; and, with
 * none, a problem (voice then behaves as Adaptive voice off). The recap call is the heavy model: it resolves as the
 * conversation's own model, and is costed as `listener`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { ResolveRequest } from '@agenthix/core'
import { decide, type Layers, type RouteProvider, type Snapshot } from '../decide'
import { clearInworldLists, setInworldList } from '../inworldModelStore'
import { LISTENER_MODELS } from '../listener'
import { INWORLD_MODELS } from './inworldFixture'

const anthropic: RouteProvider = { id: 'p-ant', name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const openrouter: RouteProvider = { id: 'p-or', name: 'OpenRouter', vendor: 'openrouter', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const openai: RouteProvider = { id: 'p-oai', name: 'OpenAI', vendor: 'openai', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const google: RouteProvider = { id: 'p-goo', name: 'Google', vendor: 'google', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const inworld: RouteProvider = { id: 'p-iw', name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const assembly: RouteProvider = { id: 'p-aai', name: 'AssemblyAI', vendor: 'assemblyai', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const sub: RouteProvider = { id: 'p-sub', name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', state: 'works', ownerUserId: 'u1' }

const NONE: Layers = { conversation: null, stt: null, tts: null }
const sonnet = { providerId: 'p-ant', model: 'claude-sonnet-4-5' }

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    providers: [anthropic, openrouter], org: { ...NONE, conversation: sonnet }, agent: { ...NONE, conversation: sonnet },
    agentName: 'Kernel', lists: [], conversationModel: sonnet, billingProfileId: 'bp-default', ...over,
  }
}
const req = (over: Partial<ResolveRequest> = {}): ResolveRequest =>
  ({ purpose: 'listener', place: { kind: 'project', projectId: 'pr1' }, conversationId: 'c1', ...over })

function ok(answer: ReturnType<typeof decide>) {
  if (!answer.ok) throw new Error(`expected a resolution, got ${answer.problem.code}`)
  return answer.resolution
}

beforeEach(() => clearInworldLists())

describe('decide: the light model, purpose listener @SC-2221 @SC-2218', () => {
  it("takes a fast model from the short list, never the agent's or the conversation's model", () => {
    const r = ok(decide(req(), snap()))
    expect(r.model).not.toEqual(sonnet)
    expect(r.model).toEqual({ providerId: 'p-ant', model: 'claude-haiku-4-5' })
    expect(r).toMatchObject({ purpose: 'listener', runtime: null, from: 'organisation', basis: 'ESTIMATED' })
  })

  it('takes OpenRouter\'s measured baseline, DeepSeek Flash, when OpenRouter is the provider', () => {
    expect(ok(decide(req(), snap({ providers: [openrouter] }))).model).toEqual({ providerId: 'p-or', model: '~deepseek/deepseek-flash-latest' })
  })

  it('takes an Inworld-routed fast model first when the organisation has Inworld, whatever order the providers were added in', () => {
    setInworldList('p-iw', INWORLD_MODELS)
    const r = ok(decide(req(), snap({ providers: [openrouter, anthropic, inworld] })))
    expect(r).toMatchObject({ vendor: 'inworld', model: { providerId: 'p-iw', model: 'anthropic/claude-haiku-5-5' } })
  })

  it('passes over Inworld when its list is not read yet, or it is not working', () => {
    expect(ok(decide(req(), snap({ providers: [inworld, openrouter] }))).vendor).toBe('openrouter')
    setInworldList('p-iw', INWORLD_MODELS)
    expect(ok(decide(req(), snap({ providers: [{ ...inworld, state: 'key_refused' }, openrouter] }))).vendor).toBe('openrouter')
  })

  it('then follows the providers in the order they were added', () => {
    expect(ok(decide(req(), snap({ providers: [openrouter, anthropic] }))).vendor).toBe('openrouter')
    expect(ok(decide(req(), snap({ providers: [openai, openrouter] }))).model).toEqual({ providerId: 'p-oai', model: 'gpt-5.6-luna' })
  })

  it('respects the lists: a fast model a list rules out is passed over for the next', () => {
    const lists: Snapshot['lists'] = [{ mode: 'every', entries: [{ effect: 'never', pattern: 'anthropic/claude-haiku-4-5' }] }]
    expect(ok(decide(req(), snap({ lists }))).model).toEqual({ providerId: 'p-or', model: '~deepseek/deepseek-flash-latest' })
  })

  it("never uses a person's own subscription, even in their own place", () => {
    const answer = decide(req({ place: { kind: 'own', userId: 'u1' } }), snap({ providers: [sub] }))
    expect(answer.ok).toBe(false)
  })

  it('with no fast model reachable, says so, so voice runs as Adaptive voice off', () => {
    expect(decide(req(), snap({ providers: [google] }))).toMatchObject({ ok: false, problem: { code: 'no_allowed_model' } })
    expect(decide(req(), snap({ providers: [assembly] }))).toMatchObject({ ok: false, problem: { code: 'no_provider' } })
    const answer = decide(req(), snap({ providers: [google] }))
    if (answer.ok) throw new Error('expected a problem')
    expect(answer.problem.message).toMatch(/fast model for listening/)
  })

  it('a pick for the call wins, as the playground makes one', () => {
    const pick = { providerId: 'p-or', model: '~deepseek/deepseek-flash-latest' }
    expect(ok(decide(req({ pick }), snap())).model).toEqual(pick)
  })

  it('lists only models hq knows each vendor reaches, or Inworld ids', () => {
    expect(LISTENER_MODELS.openrouter).toContain('~deepseek/deepseek-flash-latest')
    expect(Object.keys(LISTENER_MODELS).sort()).toEqual(['anthropic', 'inworld', 'openai', 'openrouter'])
  })
})

describe('decide: the recap call, the heavy model costed as listener @SC-2221 @SC-2218', () => {
  it("resolves as the conversation's own model", () => {
    const r = ok(decide(req({ purpose: 'conversation' }), snap()))
    expect(r.model).toEqual(sonnet)
  })
})
