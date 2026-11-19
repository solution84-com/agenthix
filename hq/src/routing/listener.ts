/**
 * Which light model listens in a voice conversation (adaptive voice listening, spec §Which light model, and its cost):
 * the purpose `listener` has its own branch in the resolver, so it never falls through to the agent's conversation
 * model. Inworld first when the organisation has it, its one key routing to other makers' fast models; then each
 * provider in the order it was added, each with its own short list of fast models, first that may run. No setting.
 *
 * The lists hold models hq's catalogue or Inworld's list names. Measured for this purpose: OpenRouter's DeepSeek Flash
 * (phase 1). Measured as a fast line writer before (the acknowledgement benchmark of October 2026): OpenAI's Luna and
 * Anthropic's Haiku, called directly; through OpenRouter only DeepSeek Flash held up. Google's fast models missed that
 * benchmark's bar (slow, or wrong too often), so Google has none here: an organisation with only Google gets no light
 * model, and voice runs as Adaptive voice off.
 */
import type { AiProviderVendor, ModelViaProvider } from '@agenthix/core'

export const LISTENER_MODELS: Partial<Record<AiProviderVendor, readonly string[]>> = {
  inworld: ['anthropic/claude-haiku-5-5', 'openai/gpt-6-luna', 'inworld/models/deepseek-v4-flash', 'openai/gpt-5.4-nano'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5'],
  openai: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-nano'],
  openrouter: ['~deepseek/deepseek-flash-latest', '~anthropic/claude-haiku-latest'],
}

/**
 * The hum service's own short list (purpose `backchannel`, spec §The backchannel): fast models that answer with one
 * word, the measured baseline DeepSeek Flash first where a provider reaches it, chosen the same way as the light model's.
 */
export const BACKCHANNEL_MODELS: Partial<Record<AiProviderVendor, readonly string[]>> = {
  inworld: ['inworld/models/deepseek-v4-flash', 'anthropic/claude-haiku-5-5', 'openai/gpt-6-luna', 'openai/gpt-5.4-nano'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5'],
  openai: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-nano'],
  openrouter: ['~deepseek/deepseek-flash-latest', '~anthropic/claude-haiku-latest'],
}

type Provider = { id: string; vendor: AiProviderVendor }

/** The first fast model of `lists` that may run, Inworld's first, then by provider order; null when none may. */
export function listenerChoice(
  providers: readonly Provider[], mayRun: (choice: ModelViaProvider) => boolean, lists = LISTENER_MODELS,
): ModelViaProvider | null {
  const ordered = [...providers.filter(p => p.vendor === 'inworld'), ...providers.filter(p => p.vendor !== 'inworld')]
  for (const p of ordered) {
    for (const model of lists[p.vendor] ?? []) {
      const choice = { providerId: p.id, model }
      if (mayRun(choice)) return choice
    }
  }
  return null
}
