import { describe, it, expect } from 'vitest'
import { MockEmbeddingModelV3 } from 'ai/test'
import { createProviderEmbedder, parseProviderModel } from '../providerEmbedder'

const key = { provider: 'openai' as const, apiKey: 'sk-test' }

function mockModel(vectors: Record<string, number[]>) {
  return new MockEmbeddingModelV3({ doEmbed: async ({ values }) => ({ embeddings: values.map(v => vectors[v]), warnings: [] }) })
}

describe('a provider\'s embedding model @SC-988', () => {
  it('is named <provider>/<model>, for a provider with embeddings', () => {
    expect(parseProviderModel('openai/text-embedding-3-small')).toEqual({ provider: 'openai', model: 'text-embedding-3-small' })
    expect(parseProviderModel('anthropic/claude')).toBeNull()
    expect(parseProviderModel('local')).toBeNull()
    expect(parseProviderModel('openai/')).toBeNull()
  })

  it('embeds with the organisation\'s key and returns unit vectors', async () => {
    const used: string[] = []
    const embedder = createProviderEmbedder('openai/text-embedding-3-small', {
      readKey: async (provider) => { used.push(provider); return key },
      modelOf: () => mockModel({ a: [3, 4], b: [0, 2] }),
    })
    expect(await embedder.embed(['a', 'b'])).toEqual([[0.6, 0.8], [0, 1]])
    expect(used).toEqual(['openai'])
    expect(embedder.dimensions).toBe(2)
    expect(embedder.model).toBe('openai/text-embedding-3-small')
  })

  it('fails without the organisation\'s key, so the item waits for the background re-embed', async () => {
    const embedder = createProviderEmbedder('google/gemini-embedding-001', { readKey: async () => null, modelOf: () => mockModel({}) })
    await expect(embedder.embed(['a'])).rejects.toThrow(/no google key/)
  })

  it('is refused for a setting that names no provider it can use', () => {
    expect(() => createProviderEmbedder('anthropic/claude')).toThrow()
  })
})
