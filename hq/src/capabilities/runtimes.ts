/**
 * Which runtime a provider's models run on, in the words setup and the AI page use. The rule is routing's own
 * (`runtimeFor`), so a screen never says something different from where the work goes. `runtimeFor` and what it reads
 * are pure, so the client may call it.
 */
import {
  CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME, providerStateWorks,
  type AgentRuntimeName, type AiProviderSummary,
} from '@agenthix/core'
import { runtimeFor } from '../routing/modelKeys'

export type RuntimeProvider = Pick<AiProviderSummary, 'vendor' | 'credential' | 'types' | 'state'>

/** How the screens name a runtime: the program an agent works in. */
export const RUNTIME_WORDS: Record<AgentRuntimeName, string> = {
  [CLAUDE_SDK_RUNTIME]: 'Claude Code',
  [OPENCODE_RUNTIME]: 'OpenCode',
}

const ORDER: readonly AgentRuntimeName[] = [CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME]

/**
 * The runtimes a provider's models run on; none for a provider that only hears or speaks. Agenthix Cloud serves Claude
 * models and others, so it is asked about one of each; every other vendor's runtime does not depend on the model.
 */
export function providerRuntimes(p: Pick<RuntimeProvider, 'vendor' | 'credential' | 'types'>): AgentRuntimeName[] {
  if (!p.types.includes('llm')) return []
  const asked = p.vendor === 'cloud' ? ['anthropic/claude', 'openai/gpt'] : ['']
  const found = new Set(asked.map(model => runtimeFor(p.vendor, p.credential, model)))
  return ORDER.filter(r => found.has(r))
}

/** The runtimes in use: those of every provider that offers models and works, Claude Code first. */
export function runtimesInUse(providers: readonly RuntimeProvider[]): AgentRuntimeName[] {
  const found = new Set(providers.filter(p => providerStateWorks(p.state)).flatMap(providerRuntimes))
  return ORDER.filter(r => found.has(r))
}

/**
 * The runtime line of a provider's card, as the runtime's name to show in bold and the words around it; null for a
 * provider that only hears or speaks.
 */
export function runtimeLine(p: Pick<RuntimeProvider, 'vendor' | 'credential' | 'types'>): { lead: string; runtimes: string[] } | null {
  const runs = providerRuntimes(p)
  if (runs.length === 0) return null
  return { lead: 'Agents run its models on', runtimes: runs.map(r => RUNTIME_WORDS[r]) }
}
