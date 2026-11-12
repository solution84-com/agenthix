import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { isDemoMode } from '@agenthix/core'
import { ModelCallError, type ResolvedAccess } from '../contract'
import { INWORLD_LLM_BASE_URL, inworldLlmAuthorization } from '../../shared/inworldLlm'
import { openRouterFetch, type OpenRouterHints } from './openRouterCaching'
import { thinkingFetch, type AnthropicThinking } from './anthropicThinking'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** Presents the key in the form Inworld reads, whatever header the SDK would have set. */
function inworldFetch(apiKey: string, base: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', inworldLlmAuthorization(apiKey))
    return base(input, { ...init, headers })
  }
}

/** What a request adds beyond the access: OpenRouter's caching hints, and a fetch tests replace. */
export interface ModelCallExtras {
  openRouter?: OpenRouterHints
  /** Anthropic's thinking for this call, written into the body: the SDK's options take neither form used here. */
  anthropicThinking?: AnthropicThinking
  fetch?: typeof globalThis.fetch
}

/** In demo mode no vendor is ever called (ADR-0186): every path that would make one refuses here. */
export const DEMO_NO_VENDOR = 'This is a demo: no model provider is called.'

export function languageModelFor(access: ResolvedAccess, extras: ModelCallExtras = {}): LanguageModel {
  if (isDemoMode(process.env)) throw new ModelCallError('unavailable', DEMO_NO_VENDOR)
  // A resolved model is named as its vendor names it, which is what the SDK takes.
  const id = access.model
  switch (access.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: access.apiKey, fetch: extras.anthropicThinking ? thinkingFetch(extras.anthropicThinking, extras.fetch) : extras.fetch })(id)
    case 'openai':
      return createOpenAI({ apiKey: access.apiKey, fetch: extras.fetch })(id)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: access.apiKey, fetch: extras.fetch })(id)
    case 'openrouter': {
      const fetch = extras.openRouter ? openRouterFetch(extras.openRouter, extras.fetch) : extras.fetch
      return createOpenAI({ apiKey: access.apiKey, baseURL: OPENROUTER_BASE_URL, fetch }).chat(id)
    }
    // Inworld names a model `maker/model` (adr-0183); the id passes as the resolver chose it.
    case 'inworld':
      return createOpenAI({ apiKey: access.apiKey, baseURL: INWORLD_LLM_BASE_URL, fetch: inworldFetch(access.apiKey, extras.fetch) }).chat(id)
    case 'openai_compatible':
      return createOpenAI({ apiKey: access.apiKey, baseURL: access.baseUrl, fetch: extras.fetch }).chat(id)
  }
}
