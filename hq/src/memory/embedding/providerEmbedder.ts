/**
 * A provider's embedding model, the option an organisation may choose instead of the local one (memory and
 * knowledge spec, Recall by meaning). Named `<provider>/<model>` and paid for with the organisation's own key for
 * that provider — memory is the organisation's, so no person's or project's key pays for it.
 */
import { embedMany, type EmbeddingModel } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { Embedder } from '../contract'
import { readApiKey, type StoredApiKey } from '../../model-access/apiKeys'

/** The providers with an embedding model the AI SDK reaches. */
export const EMBEDDING_PROVIDERS = ['openai', 'google', 'openai_compatible'] as const
export type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number]

/** A setting's provider and model, or null when it names no provider this supports. */
export function parseProviderModel(setting: string): { provider: EmbeddingProvider; model: string } | null {
  const slash = setting.indexOf('/')
  if (slash <= 0 || slash === setting.length - 1) return null
  const provider = setting.slice(0, slash)
  if (!(EMBEDDING_PROVIDERS as readonly string[]).includes(provider)) return null
  return { provider: provider as EmbeddingProvider, model: setting.slice(slash + 1) }
}

export function embeddingModelOf(provider: EmbeddingProvider, model: string, key: StoredApiKey): EmbeddingModel {
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey: key.apiKey }).embedding(model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: key.apiKey }).embedding(model)
    case 'openai_compatible':
      return createOpenAI({ apiKey: key.apiKey, baseURL: key.baseUrl }).embedding(model)
  }
}

export interface ProviderEmbedderDeps {
  readKey?: (provider: EmbeddingProvider) => Promise<StoredApiKey | null>
  /** Tests replace this with the SDK's mock embedding model. */
  modelOf?: (provider: EmbeddingProvider, model: string, key: StoredApiKey) => EmbeddingModel
}

function unit(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0))
  return norm === 0 ? vector : vector.map(v => v / norm)
}

export function createProviderEmbedder(setting: string, deps: ProviderEmbedderDeps = {}): Embedder {
  const parsed = parseProviderModel(setting)
  if (!parsed) throw new Error(`"${setting}" names no embedding model hq can use`)
  const readKey = deps.readKey ?? (provider => readApiKey('org', 'org', provider))
  const modelOf = deps.modelOf ?? embeddingModelOf
  let dimensions = 0
  return {
    model: setting,
    get dimensions() {
      return dimensions
    },
    async embed(texts) {
      if (texts.length === 0) return []
      const key = await readKey(parsed.provider)
      if (!key) throw new Error(`The organisation has no ${parsed.provider} key for its embedding model`)
      const { embeddings } = await embedMany({ model: modelOf(parsed.provider, parsed.model, key), values: texts })
      const vectors = embeddings.map(unit)
      dimensions = vectors[0]?.length ?? dimensions
      return vectors
    },
  }
}
