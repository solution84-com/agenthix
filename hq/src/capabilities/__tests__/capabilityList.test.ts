/** What agents can do, from providers, defaults and the key: each row of the spec's mark table, and each wording case. */
import { describe, it, expect } from 'vitest'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderCredentialKind, type AiProviderState, type AiProviderVendor } from '@agenthix/core'
import { capabilityList, type Capability, type CapabilityDefaults } from '../capabilityList'
import { providerRuntimes, runtimesInUse } from '../runtimes'
import type { ChoiceView } from '../../models-settings/types'

const provider = (vendor: AiProviderVendor, state: AiProviderState = 'works', credential: AiProviderCredentialKind = AI_PROVIDER_VENDOR_INFO[vendor].credential) =>
  ({ vendor, credential, types: [...AI_PROVIDER_VENDOR_INFO[vendor].types], state })
const choice = (text: string, notWorking = false): ChoiceView => ({ providerId: 'p', model: 'm', text, notWorking })
const none: CapabilityDefaults = { conversation: null, stt: null, tts: null }

const list = (providers: ReturnType<typeof provider>[], defaults: CapabilityDefaults = none, webSearchKey = false) =>
  capabilityList({ providers, defaults, webSearchKey })
const of = (caps: Capability[], id: Capability['id']) => caps.find(c => c.id === id)!

describe('the capability list', () => {
  it('lists Thinking, Hearing, Speaking and Web search, in that order, always', () => {
    expect(list([]).map(c => c.name)).toEqual(['Thinking', 'Hearing', 'Speaking', 'Web search'])
  })

  describe('Thinking, Hearing and Speaking', () => {
    it('✓ with what agents use and Change, when a default is set from a working provider', () => {
      const caps = list([provider('inworld')], { conversation: choice('DeepSeek V4 · via Inworld'), stt: choice('Inworld STT · via Inworld'), tts: choice('Inworld TTS · Ashley · via Inworld') })
      for (const id of ['thinking', 'hearing', 'speaking'] as const) {
        expect(of(caps, id)).toMatchObject({ mark: 'can', action: 'change' })
      }
      expect(of(caps, 'speaking').line).toBe('Inworld TTS · Ashley · via Inworld')
    })

    it('○ saying which kind to add, when no working provider offers it', () => {
      const caps = list([provider('anthropic', 'key_refused')])
      expect(of(caps, 'thinking')).toMatchObject({ mark: 'would_add', line: 'Add a provider that offers models.', action: 'add_provider' })
      expect(of(caps, 'hearing')).toMatchObject({ mark: 'would_add', line: 'Add a provider that hears people.' })
      expect(of(caps, 'speaking')).toMatchObject({ mark: 'would_add', line: 'Add a provider that speaks.' })
    })

    it('a provider that only hears gives Hearing and nothing else', () => {
      const caps = list([provider('assemblyai')], { ...none, stt: choice('Universal · via AssemblyAI') })
      expect(of(caps, 'hearing').mark).toBe('can')
      expect(of(caps, 'thinking').mark).toBe('would_add')
      expect(of(caps, 'speaking').mark).toBe('would_add')
    })

    it('○ with Change when a working provider offers it but no default is chosen, or its provider stopped working', () => {
      expect(of(list([provider('openrouter')]), 'thinking')).toMatchObject({ mark: 'would_add', line: 'Not chosen yet.', action: 'change' })
      const stopped = list([provider('openrouter')], { ...none, conversation: choice('Claude Sonnet 5 · via Anthropic', true) })
      expect(of(stopped, 'thinking')).toMatchObject({ mark: 'would_add', line: 'Claude Sonnet 5 · via Anthropic: its provider isn’t working.', action: 'change' })
    })
  })

  describe('Web search', () => {
    it('○ "Comes with your first model provider." before any model provider works', () => {
      for (const providers of [[], [provider('assemblyai')], [provider('openrouter', 'unreachable')]]) {
        expect(of(list(providers), 'web_search')).toMatchObject({ mark: 'would_add', line: 'Comes with your first model provider.', runtimes: [], action: null })
      }
    })

    it('✓ "Built into Claude Code." when Claude Code is the only runtime, with no sub-lines', () => {
      expect(of(list([provider('anthropic')]), 'web_search')).toMatchObject({ mark: 'can', line: 'Built into Claude Code.', runtimes: [], action: null })
    })

    it('a key kept beside Claude Code alone can still be changed from its line', () => {
      expect(of(list([provider('anthropic')], none, true), 'web_search')).toMatchObject({ mark: 'can', action: 'change' })
    })

    it('a person’s own Claude subscription counts as Claude Code', () => {
      expect(of(list([provider('anthropic', 'works', 'subscription')]), 'web_search').line).toBe('Built into Claude Code.')
    })

    it('○ "OpenCode needs a search key." with Add a key, when OpenCode is the only runtime and has no key', () => {
      expect(of(list([provider('openrouter')]), 'web_search')).toMatchObject({ mark: 'would_add', line: 'OpenCode needs a search key.', runtimes: [], action: 'add_key' })
    })

    it('✓ "Exa" with Change, when OpenCode is the only runtime and a key is saved', () => {
      expect(of(list([provider('openrouter'), provider('inworld')], none, true), 'web_search')).toMatchObject({ mark: 'can', line: 'Exa', runtimes: [], action: 'change' })
    })

    it('! "Some agents can search." with a line per runtime and Add a key, when Claude Code is in use beside OpenCode with no key', () => {
      const ws = of(list([provider('anthropic'), provider('openrouter')]), 'web_search')
      expect(ws).toMatchObject({ mark: 'some', line: 'Some agents can search.', action: 'add_key' })
      expect(ws.runtimes).toEqual([
        { runtime: 'claude-sdk', name: 'Claude Code', text: '✓ on its own', ok: true },
        { runtime: 'opencode', name: 'OpenCode', text: 'needs a search key', ok: false },
      ])
    })

    it('✓ "Every agent can search." with a line per runtime and Change, when both are in use and a key is saved', () => {
      const ws = of(list([provider('anthropic'), provider('openrouter')], none, true), 'web_search')
      expect(ws).toMatchObject({ mark: 'can', line: 'Every agent can search.', action: 'change' })
      expect(ws.runtimes.map(r => [r.name, r.text, r.ok])).toEqual([['Claude Code', '✓ on its own', true], ['OpenCode', '✓ Exa', true]])
    })

    it('counts only working providers that offer models as runtimes in use', () => {
      expect(of(list([provider('anthropic', 'key_refused'), provider('openrouter')]), 'web_search').line).toBe('OpenCode needs a search key.')
    })
  })
})

describe('runtimes', () => {
  it('names the runtime a provider’s models run on, and none for one that only hears or speaks', () => {
    expect(providerRuntimes(provider('anthropic'))).toEqual(['claude-sdk'])
    expect(providerRuntimes(provider('openai'))).toEqual(['opencode'])
    expect(providerRuntimes(provider('inworld'))).toEqual(['opencode'])
    expect(providerRuntimes(provider('openai_compatible'))).toEqual(['opencode'])
    expect(providerRuntimes(provider('assemblyai'))).toEqual([])
  })

  it('gives Agenthix Cloud both: its Claude models on Claude Code, its others on OpenCode', () => {
    expect(providerRuntimes(provider('cloud'))).toEqual(['claude-sdk', 'opencode'])
  })

  it('lists the runtimes in use once each, Claude Code first', () => {
    expect(runtimesInUse([provider('openrouter'), provider('google'), provider('anthropic')])).toEqual(['claude-sdk', 'opencode'])
  })
})
