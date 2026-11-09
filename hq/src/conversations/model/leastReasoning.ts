/**
 * The least reasoning an OpenAI or Google model takes, for a step spoken aloud (voice that stays in the conversation,
 * spec §1 *Reasoning*; #28): the first step of the reply to a spoken message, or any step of a reply someone hears
 * (`LeadRequest.spoken`). Anthropic's is in anthropicThinking.ts, OpenRouter's in openRouterCaching.ts. A step
 * without either flag, such as one after a spoken message's tools, is sent nothing and reasons as the model does.
 *
 * Each rule follows the vendor's published settings for its models; a model it does not recognise is sent nothing,
 * since an effort a model does not take is refused, and an OpenAI-compatible endpoint has no standard setting.
 */
import type { SharedV3ProviderOptions } from '@ai-sdk/provider'
import type { LeadRequest } from '../contract'

type ProviderOptions = SharedV3ProviderOptions

type OpenAIEffort = 'none' | 'minimal' | 'low'

/** GPT-5.1 and later turn reasoning off; GPT-5 goes to minimal; the o-series to low. Models that do not reason: null. */
export function leastOpenAIEffort(model: string): OpenAIEffort | null {
  const gpt5 = /(?:^|\/)gpt-5(?:\.(\d+))?(?!\d)/i.exec(model)
  if (gpt5) {
    if (/gpt-5[^/]*-chat/i.test(model)) return null
    return gpt5[1] !== undefined && Number(gpt5[1]) >= 1 ? 'none' : 'minimal'
  }
  return /(?:^|\/)o[134](?:-|$)/i.test(model) ? 'low' : null
}

/** Gemini 2.5 Flash turns thinking off, 2.5 Pro takes its least budget, Gemini 3 and later its low level. */
export function leastGoogleThinking(model: string): { thinkingBudget: number } | { thinkingLevel: 'low' } | null {
  const gemini = /(?:^|\/)gemini-(\d+)(?:\.(\d+))?-?([a-z-]*)/i.exec(model)
  if (!gemini) return null
  const major = Number(gemini[1])
  if (major >= 3) return { thinkingLevel: 'low' }
  if (major !== 2 || gemini[2] !== '5') return null
  return /^pro/i.test(gemini[3] ?? '') ? { thinkingBudget: 128 } : { thinkingBudget: 0 }
}

/** The provider options that keep a spoken step's reasoning least; empty for any other step or provider. */
export function leastReasoningOptions(request: Pick<LeadRequest, 'access' | 'spoken' | 'firstSpokenStep'>): ProviderOptions {
  if (request.spoken !== true && request.firstSpokenStep !== true) return {}
  const { provider, model } = request.access
  if (provider === 'openai') {
    const effort = leastOpenAIEffort(model)
    return effort ? { openai: { reasoningEffort: effort } } : {}
  }
  if (provider === 'google') {
    const thinkingConfig = leastGoogleThinking(model)
    return thinkingConfig ? { google: { thinkingConfig } } : {}
  }
  return {}
}

/** Both sets of options, merged provider by provider. */
export function mergeProviderOptions(a: ProviderOptions | undefined, b: ProviderOptions): ProviderOptions | undefined {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b)])
  if (keys.size === 0) return undefined
  return Object.fromEntries([...keys].map(k => [k, { ...(a?.[k] ?? {}), ...(b[k] ?? {}) }]))
}
