import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { ResolvedAccess } from '../contract'
import { openRouterFetch, type OpenRouterHints } from './openRouterCaching'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** The runtimes write a model `<provider>/<model>` for every provider but Anthropic; the SDK wants the model alone. */
export function sdkModelId(access: Pick<ResolvedAccess, 'provider' | 'model'>): string {
  const prefix = `${access.provider}/`
  return access.provider !== 'anthropic' && access.model.startsWith(prefix) ? access.model.slice(prefix.length) : access.model
}

/** What a request adds beyond the access: OpenRouter's caching hints, and a fetch tests replace. */
export interface ModelCallExtras {
  openRouter?: OpenRouterHints
  fetch?: typeof globalThis.fetch
}

export function languageModelFor(access: ResolvedAccess, extras: ModelCallExtras = {}): LanguageModel {
  const id = sdkModelId(access)
  switch (access.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: access.apiKey, fetch: extras.fetch })(id)
    case 'openai':
      return createOpenAI({ apiKey: access.apiKey, fetch: extras.fetch })(id)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: access.apiKey, fetch: extras.fetch })(id)
    case 'openrouter': {
      const fetch = extras.openRouter ? openRouterFetch(extras.openRouter, extras.fetch) : extras.fetch
      return createOpenAI({ apiKey: access.apiKey, baseURL: OPENROUTER_BASE_URL, fetch }).chat(id)
    }
    case 'openai_compatible':
      return createOpenAI({ apiKey: access.apiKey, baseURL: access.baseUrl, fetch: extras.fetch }).chat(id)
  }
}
