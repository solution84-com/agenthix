import { describe, expect, it } from 'vitest'
import type { ResolveRequest } from '@agenthix/core'
import { defaultModelOf } from '@agenthix/core'
import { modelsReachedBy } from '../modelKeys'
import { decide, type Layers, type RouteProvider, type Snapshot } from '../decide'

const anthropic: RouteProvider = { id: 'p-ant', name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const openrouter: RouteProvider = { id: 'p-or', name: 'OpenRouter', vendor: 'openrouter', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const assembly: RouteProvider = { id: 'p-aai', name: 'AssemblyAI', vendor: 'assemblyai', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const inworld: RouteProvider = { id: 'p-iw', name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', state: 'works', ownerUserId: null }
const sub: RouteProvider = { id: 'p-sub', name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', state: 'works', ownerUserId: 'u1' }

const NONE: Layers = { conversation: null, stt: null, tts: null }
const sonnet = { providerId: 'p-ant', model: 'claude-sonnet-4-5' }
const opus = { providerId: 'p-ant', model: 'claude-opus-4-5' }

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    providers: [anthropic, openrouter, assembly, inworld],
    org: { ...NONE, conversation: sonnet, stt: { providerId: 'p-aai', model: 'universal-3-6-pro' }, tts: { providerId: 'p-iw', model: 'inworld-tts-2', voice: 'Ashley' } },
    agent: null, agentName: 'Kernel', lists: [], conversationModel: null, billingProfileId: 'bp-default',
    ...over,
  }
}

const shared: ResolveRequest['place'] = { kind: 'project', projectId: 'pr1' }
const req = (over: Partial<ResolveRequest> = {}): ResolveRequest => ({ purpose: 'conversation', place: shared, ...over })

function ok(answer: ReturnType<typeof decide>) {
  if (!answer.ok) throw new Error(`expected a resolution, got ${answer.problem.code}`)
  return answer.resolution
}

describe('decide: which model @SC-1192', () => {
  it("a conversation takes the organisation's default with no agent's own", () => {
    const r = ok(decide(req(), snap()))
    expect(r).toMatchObject({ model: sonnet, from: 'organisation', providerName: 'Anthropic', runtime: null, billingProfileId: 'bp-default' })
    expect(r.fellBack).toBeUndefined()
  })

  it("the agent's own default overrides the organisation's", () => {
    const r = ok(decide(req(), snap({ agent: { ...NONE, conversation: opus } })))
    expect(r).toMatchObject({ model: opus, from: 'agent' })
  })

  it('a person’s pick wins over every default', () => {
    const pick = { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' }
    expect(ok(decide(req({ pick }), snap({ agent: { ...NONE, conversation: opus } })))).toMatchObject({ model: pick, from: 'pick' })
  })

  it('work takes the one default model, and its runtime follows the model and provider @SC-1193', () => {
    expect(ok(decide(req({ purpose: 'worker' }), snap()))).toMatchObject({ model: sonnet, from: 'organisation', runtime: 'claude-sdk' })
    expect(ok(decide(req({ purpose: 'worker' }), snap({ agent: { ...NONE, conversation: opus } })))).toMatchObject({ model: opus, from: 'agent' })
    const deepseek = { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' }
    expect(ok(decide(req({ purpose: 'helper', pick: deepseek }), snap()))).toMatchObject({ runtime: 'opencode' })
    const claudeViaOpenRouter = { providerId: 'p-or', model: 'anthropic/claude-sonnet-4.5' }
    expect(ok(decide(req({ purpose: 'worker', pick: claudeViaOpenRouter }), snap()))).toMatchObject({ runtime: 'opencode' })
  })

  it("titles and summaries take the conversation's own model", () => {
    const conversationModel = { providerId: 'p-or', model: 'openai/gpt-5' }
    expect(ok(decide(req({ purpose: 'title' }), snap({ conversationModel })))).toMatchObject({ model: conversationModel, from: 'conversation' })
  })

  it("the voice sample phrase takes the organisation's default model, never the agent's", () => {
    const r = ok(decide(req({ purpose: 'voice_sample', place: { kind: 'organisation' } }), snap({ agent: { ...NONE, conversation: opus } })))
    expect(r.model).toEqual(sonnet)
  })

  it('costs on an own key are estimated when the price list knows the model, else unpriced', () => {
    expect(ok(decide(req(), snap())).basis).toBe('ESTIMATED')
    const typed: RouteProvider = { id: 'p-oc', name: 'Local', vendor: 'openai_compatible', credentialKind: 'api_key', state: 'works', ownerUserId: null }
    const r = ok(decide(req({ pick: { providerId: 'p-oc', model: 'llama3' } }), snap({ providers: [typed] })))
    expect(r.basis).toBe('UNPRICED')
  })
})

describe("decide: one model for a conversation and the work it hands off @SC-955", () => {
  const picked = { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' }
  const fromConversation = (over: Partial<ResolveRequest> = {}) => req({ conversationId: 'c1', ...over })

  it('the lead and its workers run on the model the person picked in the conversation', () => {
    const s = snap({ conversationModel: picked, agent: { ...NONE, conversation: opus } })
    expect(ok(decide(fromConversation(), s))).toMatchObject({ model: picked, from: 'conversation' })
    for (const purpose of ['worker', 'helper'] as const) {
      const r = ok(decide(fromConversation({ purpose }), s))
      expect(r).toMatchObject({ model: picked, from: 'conversation', runtime: 'opencode' })
      expect(r.fellBack).toBeUndefined()
    }
  })

  it("a model the person's words name for the work wins over the conversation's", () => {
    expect(ok(decide(fromConversation({ purpose: 'worker', pick: opus }), snap({ conversationModel: picked })))).toMatchObject({ model: opus, from: 'pick' })
  })

  it("work a list rules the conversation's model out for falls to the next allowed, and says so", () => {
    const lists = [{ mode: 'every' as const, entries: [{ effect: 'never' as const, pattern: 'deepseek/*' }] }]
    const r = ok(decide(fromConversation({ purpose: 'worker' }), snap({ conversationModel: picked, lists, agent: { ...NONE, conversation: opus } })))
    expect(r).toMatchObject({ model: opus, from: 'agent' })
    expect(r.fellBack).toEqual({ from: picked, reason: 'model_not_allowed' })
  })

  it("work whose conversation's model is on a provider that is not working takes the same model elsewhere first", () => {
    const down = { ...anthropic, state: 'key_refused' as const }
    const r = ok(decide(fromConversation({ purpose: 'worker' }), snap({ providers: [down, openrouter, assembly, inworld], conversationModel: sonnet })))
    expect(r).toMatchObject({ model: { providerId: 'p-or', model: 'anthropic/claude-sonnet-4.5' }, from: 'conversation' })
    expect(r.fellBack).toEqual({ from: sonnet, reason: 'provider_not_working' })
  })

  it('work from a conversation with no model fixed yet takes the agent\'s default, else the organisation\'s', () => {
    expect(ok(decide(fromConversation({ purpose: 'worker' }), snap({ agent: { ...NONE, conversation: opus } })))).toMatchObject({ model: opus, from: 'agent' })
    expect(ok(decide(fromConversation({ purpose: 'worker' }), snap()))).toMatchObject({ model: sonnet, from: 'organisation' })
  })
})

describe('decide: lists @SC-1195', () => {
  it('a default cut by a list falls to the next layer, and says so once', () => {
    const lists = [{ mode: 'every' as const, entries: [{ effect: 'never' as const, pattern: 'anthropic/claude-sonnet-*' }] }]
    const r = ok(decide(req(), snap({ lists, org: { ...snap().org, conversation: sonnet }, agent: { ...NONE, conversation: sonnet } })))
    expect(r.model.model).not.toMatch(/sonnet/)
    expect(r.fellBack).toEqual({ from: sonnet, reason: 'model_not_allowed' })
  })

  it('a pick a list cuts is refused, never swapped', () => {
    const lists = [{ mode: 'only_these' as const, entries: [{ effect: 'allow' as const, pattern: 'anthropic/*' }] }]
    const answer = decide(req({ pick: { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' } }), snap({ lists }))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'model_not_allowed' } })
  })

  it('with every model cut, says no model may run and who can widen a list', () => {
    const lists = [{ mode: 'only_these' as const, entries: [] }]
    const answer = decide(req(), snap({ lists }))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'no_allowed_model', fixedBy: ['organisation_admin'] } })
    if (!answer.ok) expect(answer.problem.message).toContain('Kernel')
  })
})

describe('decide: a provider that is not working @SC-1196', () => {
  const down = { ...anthropic, state: 'key_refused' as const }

  it('a default on it resolves to the same model via another provider first', () => {
    const r = ok(decide(req(), snap({ providers: [down, openrouter, assembly, inworld] })))
    expect(r.model).toEqual({ providerId: 'p-or', model: 'anthropic/claude-sonnet-4.5' })
    expect(r.fellBack).toEqual({ from: sonnet, reason: 'provider_not_working' })
  })

  it('comes back by itself once it works, with nothing stored', () => {
    const s = snap({ providers: [down, openrouter, assembly, inworld] })
    expect(ok(decide(req(), s)).model.providerId).toBe('p-or')
    s.providers[0] = anthropic
    expect(ok(decide(req(), s)).model).toEqual(sonnet)
  })

  it('a conversation fixed to it is not switched: it gets the problem, naming the provider', () => {
    const answer = decide(req(), snap({ providers: [down, openrouter, assembly, inworld], conversationModel: sonnet }))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'provider_not_working', providerId: 'p-ant' } })
    if (!answer.ok) expect(answer.problem.message).toContain('An organisation admin has been told')
  })

  it('with no provider of the type working, says so', () => {
    const answer = decide(req(), snap({ providers: [down, assembly] }))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'no_provider' } })
  })
})

describe('decide: a person’s own Claude subscription @SC-1197', () => {
  const pick = { providerId: 'p-sub', model: 'claude-opus-4-5' }
  const withSub = () => snap({ providers: [sub, anthropic, openrouter, assembly, inworld] })

  it('serves work in their own place, on Claude Code, included in the subscription', () => {
    const r = ok(decide(req({ purpose: 'worker', place: { kind: 'own', userId: 'u1' }, pick }), withSub()))
    expect(r).toMatchObject({ runtime: 'claude-sdk', basis: 'INCLUDED', model: pick })
    const inPersonal = ok(decide(req({ purpose: 'worker', place: { kind: 'own', userId: 'u1', projectId: 'pp1' }, pick }), withSub()))
    expect(inPersonal.model).toEqual(pick)
  })

  it('is refused in a shared project, and in someone else’s place', () => {
    expect(decide(req({ purpose: 'worker', pick }), withSub())).toMatchObject({ ok: false, problem: { code: 'subscription_outside_own_place' } })
    expect(decide(req({ purpose: 'worker', place: { kind: 'own', userId: 'u2' }, pick }), withSub()))
      .toMatchObject({ ok: false, problem: { code: 'subscription_outside_own_place' } })
  })

  it('never pays for hq’s own calls, such as a conversation’s reply', () => {
    expect(decide(req({ place: { kind: 'own', userId: 'u1' }, pick }), withSub())).toMatchObject({ ok: false })
  })
})

describe('decide: voice @SC-1192', () => {
  it("takes the agent's own, else the organisation's, with its voice", () => {
    const r = ok(decide(req({ purpose: 'tts' }), snap()))
    expect(r).toMatchObject({ model: { providerId: 'p-iw', model: 'inworld-tts-2' }, voice: 'Ashley', basis: 'ESTIMATED' })
    const own = ok(decide(req({ purpose: 'stt' }), snap({ agent: { ...NONE, stt: { providerId: 'p-aai', model: 'universal-streaming-multilingual' } } })))
    expect(own).toMatchObject({ from: 'agent', model: { model: 'universal-streaming-multilingual' } })
  })

  it('resolves to the other provider of its type when the chosen one is not working @SC-1196', () => {
    const second: RouteProvider = { id: 'p-cloud', name: 'Agenthix Cloud', vendor: 'cloud', credentialKind: 'none', state: 'works', ownerUserId: null }
    const r = ok(decide(req({ purpose: 'tts' }), snap({ providers: [{ ...inworld, state: 'unreachable' }, second, assembly] })))
    expect(r.model.providerId).toBe('p-cloud')
    expect(r.fellBack?.reason).toBe('provider_not_working')
  })

  it('falls back, with no default chosen, to the models voice is built on @SC-1203', () => {
    const bare = snap({ org: NONE })
    expect(ok(decide(req({ purpose: 'stt' }), bare)).model).toEqual({ providerId: 'p-iw', model: 'inworld/inworld-stt-1' })
    expect(ok(decide(req({ purpose: 'tts' }), bare)).model).toEqual({ providerId: 'p-iw', model: 'inworld-tts-2' })
    const aaiOnly = snap({ org: NONE, providers: [anthropic, assembly] })
    expect(ok(decide(req({ purpose: 'stt' }), aaiOnly)).model).toEqual({ providerId: 'p-aai', model: 'universal-3-6-pro' })
  })
})

describe('decide: hearing, Inworld by default on its one key', () => {
  const aaiFirst = [anthropic, assembly, inworld]

  it('hears through Inworld when nothing is chosen, though AssemblyAI was added first', () => {
    const r = ok(decide(req({ purpose: 'stt' }), snap({ providers: aaiFirst, org: NONE })))
    expect(r).toMatchObject({ model: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' }, vendor: 'inworld', from: 'organisation', basis: 'ESTIMATED' })
    expect(r.fellBack).toBeUndefined()
  })

  it('keeps the organisation’s choice of AssemblyAI, and the agent’s own over it', () => {
    const org = { ...NONE, stt: { providerId: 'p-aai', model: 'universal-3-6-pro' } }
    expect(ok(decide(req({ purpose: 'stt' }), snap({ providers: aaiFirst, org })))).toMatchObject({ from: 'organisation', vendor: 'assemblyai' })
    const agent = { ...NONE, stt: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' } }
    expect(ok(decide(req({ purpose: 'stt' }), snap({ providers: aaiFirst, org, agent })))).toMatchObject({ from: 'agent', vendor: 'inworld' })
    const agentAai = { ...NONE, stt: { providerId: 'p-aai', model: 'universal-streaming-english' } }
    const both = { ...NONE, stt: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' } }
    expect(ok(decide(req({ purpose: 'stt' }), snap({ providers: aaiFirst, org: both, agent: agentAai }))))
      .toMatchObject({ from: 'agent', model: { providerId: 'p-aai', model: 'universal-streaming-english' } })
  })

  it('falls to AssemblyAI when Inworld is not working, and to Inworld when AssemblyAI is not', () => {
    const iwChosen = { ...NONE, stt: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' } }
    const down = ok(decide(req({ purpose: 'stt' }), snap({ providers: [anthropic, { ...inworld, state: 'key_refused' }, assembly], org: iwChosen })))
    expect(down).toMatchObject({ model: { providerId: 'p-aai', model: 'universal-3-6-pro' }, fellBack: { reason: 'provider_not_working' } })
    const aaiChosen = { ...NONE, stt: { providerId: 'p-aai', model: 'universal-3-6-pro' } }
    const other = ok(decide(req({ purpose: 'stt' }), snap({ providers: [anthropic, { ...assembly, state: 'unreachable' }, inworld], org: aaiChosen })))
    expect(other).toMatchObject({ model: { providerId: 'p-iw', model: 'inworld/inworld-stt-1' }, fellBack: { reason: 'provider_not_working' } })
  })

  it('has nothing to hear with when neither works', () => {
    const answer = decide(req({ purpose: 'stt' }), snap({ providers: [anthropic, { ...assembly, state: 'unreachable' }, { ...inworld, state: 'key_refused' }], org: NONE }))
    expect(answer).toMatchObject({ ok: false, problem: { code: 'no_provider' } })
  })
})

describe('decide: the last resort takes a provider\'s recommended model, never the first listed @SC-2197', () => {
  const recommended = (vendor: 'openrouter' | 'anthropic') => defaultModelOf(vendor, modelsReachedBy(vendor)).model
  const none = { org: NONE }

  it('on OpenRouter alone, with no default set, takes its recommended model', () => {
    const r = ok(decide(req(), snap({ providers: [openrouter], ...none })))
    expect(r.model).toEqual({ providerId: 'p-or', model: recommended('openrouter') })
    expect(r.model.model).not.toBe(modelsReachedBy('openrouter')[0]?.model)
  })

  it('takes the first provider with a usable recommended model, in provider order', () => {
    const r = ok(decide(req(), snap({ providers: [anthropic, openrouter], ...none })))
    expect(r.model).toEqual({ providerId: 'p-ant', model: recommended('anthropic') })
  })

  it('skips a provider whose recommended model a list rules out', () => {
    const lists = [{ mode: 'every' as const, entries: [{ effect: 'never' as const, pattern: `${recommended('anthropic')}` }, { effect: 'never' as const, pattern: `anthropic/${recommended('anthropic')}` }] }]
    const r = ok(decide(req(), snap({ providers: [anthropic, openrouter], lists, ...none })))
    expect(r.model.providerId).toBe('p-or')
    expect(r.model.model).toBe(recommended('openrouter'))
  })

  it('takes the catalogue\'s first usable model only when no provider has a usable recommended one', () => {
    const lists = [{ mode: 'only_these' as const, entries: [{ effect: 'allow' as const, pattern: 'aion-labs/*' }] }]
    const r = ok(decide(req(), snap({ providers: [openrouter], lists, ...none })))
    expect(r.model.model).toMatch(/^aion-labs\//)
  })
})
