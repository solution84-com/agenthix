/**
 * What agents can do: Thinking, Hearing, Speaking and Web search, each with its mark, its line and its action, worked
 * out from the organisation's providers, its defaults and whether it holds a web search key. Setup's AI and review
 * steps and the AI page draw the same list from it, so they say the same thing.
 *
 * Web search depends on the runtime, not the provider: Claude Code searches on its own, OpenCode only through Exa with
 * the organisation's key. The lines say it per runtime, and only when more than one is in use.
 */
import {
  CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME, providerTypesCovered,
  type AgentRuntimeName, type AiProviderType,
} from '@agenthix/core'
import type { ChoiceView } from '../models-settings/types'
import { TYPE_WORDS } from '../providers/components/providerWords'
import { RUNTIME_WORDS, runtimesInUse, type RuntimeProvider } from './runtimes'

export type CapabilityId = 'thinking' | 'hearing' | 'speaking' | 'web_search'

/**
 * ✓ agents can do it; ○ a provider (or a key) would add it, a note and never a fault; ! only some agents can, either
 * because one runtime cannot search (`some`) or because the default's provider stopped working (`attention`).
 */
export type CapabilityMark = 'can' | 'would_add' | 'some' | 'attention'

/**
 * `add_provider` is drawn only where the place offers it (the AI page); setup has Add a provider in its header.
 * `open_provider` opens the line of the provider `providerId` names.
 */
export type CapabilityAction = 'change' | 'add_key' | 'add_provider' | 'open_provider'

export type RuntimeLine = { runtime: AgentRuntimeName; name: string; text: string; ok: boolean }

export type Capability = {
  id: CapabilityId
  name: string
  mark: CapabilityMark
  line: string
  /** Web search's line per runtime in use, when more than one is. */
  runtimes: RuntimeLine[]
  action: CapabilityAction | null
  /** The provider `open_provider` opens: the default's, when it stopped working. */
  providerId?: string
}

export type CapabilityDefaults = { conversation: ChoiceView | null; stt: ChoiceView | null; tts: ChoiceView | null }

export type CapabilityInput = {
  providers: readonly RuntimeProvider[]
  /** As `getSetupDefaults` or `getModelsSettings` give them. */
  defaults: CapabilityDefaults
  /** `getWebSearchKeyStatus`'s `present`. */
  webSearchKey: boolean
}

export const MARK_WORDS: Record<CapabilityMark, string> = {
  can: 'Agents can do it',
  would_add: 'A provider would add it',
  some: 'Only some agents can do it',
  attention: 'Needs attention',
}

export const WEB_SEARCH_HELP =
  'A runtime is the program an agent works in. Claude Code searches the web on its own. OpenCode searches through Exa, with your organisation’s key. ' +
  'Each agent’s own permissions decide whether it may search: Search the web is Ask by default, so a person approves the search in a conversation, and an organisation admin changes it in the agent’s Permissions, from Agents › Manage agents.'

const MISSING: Record<AiProviderType, string> = {
  llm: 'Add a provider that offers models.',
  stt: 'Add a provider that hears people.',
  tts: 'Add a provider that speaks.',
}

const ID: Record<AiProviderType, CapabilityId> = { llm: 'thinking', stt: 'hearing', tts: 'speaking' }

function fromDefault(type: AiProviderType, covered: boolean, choice: ChoiceView | null): Capability {
  const base = { id: ID[type], name: TYPE_WORDS[type], runtimes: [] }
  // Agents with a model of their own still can, so it is !, and the line leads to the provider; Change stays beside it.
  // It comes first: with the default's provider the only one of its kind, the fix is that provider, not another one.
  if (choice?.notWorking) {
    return { ...base, mark: 'attention', line: `${choice.text}: its provider isn’t working.`, action: 'open_provider', providerId: choice.providerId }
  }
  if (!covered) return { ...base, mark: 'would_add', line: MISSING[type], action: 'add_provider' }
  if (!choice) return { ...base, mark: 'would_add', line: 'Not chosen yet.', action: 'change' }
  return { ...base, mark: 'can', line: choice.text, action: 'change' }
}

function webSearch(runtimes: readonly AgentRuntimeName[], key: boolean, modelProviderStopped: boolean): Capability {
  const base = { id: 'web_search' as const, name: 'Web search' }
  const keyAction: CapabilityAction = key ? 'change' : 'add_key'
  if (runtimes.length === 0) {
    const line = modelProviderStopped ? 'Comes back when a model provider works again.' : 'Comes with your first model provider.'
    return { ...base, mark: 'would_add', line, runtimes: [], action: null }
  }
  if (runtimes.length === 1) {
    if (runtimes[0] === CLAUDE_SDK_RUNTIME) {
      // A key kept from an earlier OpenCode provider can still be replaced or removed from here.
      return { ...base, mark: 'can', line: 'Built into Claude Code.', runtimes: [], action: key ? 'change' : null }
    }
    return key
      ? { ...base, mark: 'can', line: 'Exa', runtimes: [], action: keyAction }
      : { ...base, mark: 'would_add', line: 'OpenCode needs a search key.', runtimes: [], action: keyAction }
  }
  const lines: RuntimeLine[] = runtimes.map(runtime => {
    const name = RUNTIME_WORDS[runtime]
    if (runtime !== OPENCODE_RUNTIME) return { runtime, name, text: '✓ on its own', ok: true }
    return key ? { runtime, name, text: '✓ Exa', ok: true } : { runtime, name, text: 'needs a search key', ok: false }
  })
  return key
    ? { ...base, mark: 'can', line: 'Every agent can search.', runtimes: lines, action: keyAction }
    : { ...base, mark: 'some', line: 'Some agents can search.', runtimes: lines, action: keyAction }
}

export function capabilityList({ providers, defaults, webSearchKey }: CapabilityInput): Capability[] {
  const covered = providerTypesCovered(providers)
  return [
    fromDefault('llm', covered.llm, defaults.conversation),
    fromDefault('stt', covered.stt, defaults.stt),
    fromDefault('tts', covered.tts, defaults.tts),
    webSearch(runtimesInUse(providers), webSearchKey, providers.some(p => p.types.includes('llm'))),
  ]
}
