import { describe, it, expect } from 'vitest'
import { createLocalEmbedder, meanPool, truncate, type LocalRuntime } from '../localEmbedder'
import { LOCAL_EMBEDDING_MODEL } from '../localModelManifest'

/** A model whose hidden state for each token is that token's id in every dimension: pooling is easy to check. */
function fakeRuntime(log: string[] = []): LocalRuntime {
  return {
    encode(text) {
      const ids = [101, ...text.split(' ').map(w => w.length), 102]
      return { ids, attentionMask: ids.map(() => 1) }
    },
    async run({ ids }) {
      log.push(`run ${ids.length}`)
      return { data: ids.flatMap(id => [id, 0, 0]), dims: 3 }
    },
  }
}

describe('the local embedder @SC-988', () => {
  it('is the organisation setting `local`, with the model\'s dimensions', () => {
    const embedder = createLocalEmbedder(async () => fakeRuntime())
    expect(embedder.model).toBe('local')
    expect(embedder.dimensions).toBe(384)
  })

  it('returns one unit vector per text, in order', async () => {
    const vectors = await createLocalEmbedder(async () => fakeRuntime()).embed(['ab cd', 'x'])
    expect(vectors).toHaveLength(2)
    for (const v of vectors) expect(Math.hypot(...v)).toBeCloseTo(1)
  })

  it('loads the model once, on first use, however many calls arrive together', async () => {
    let loads = 0
    const embedder = createLocalEmbedder(async () => { loads++; return fakeRuntime() })
    expect(loads).toBe(0)
    await Promise.all([embedder.embed(['a']), embedder.embed(['b']), embedder.embed(['c'])])
    expect(loads).toBe(1)
  })

  it('tries the load again after it failed, rather than failing for good', async () => {
    let attempt = 0
    const embedder = createLocalEmbedder(async () => {
      if (++attempt === 1) throw new Error('offline')
      return fakeRuntime()
    })
    await expect(embedder.embed(['a'])).rejects.toThrow('offline')
    await expect(embedder.embed(['a'])).resolves.toHaveLength(1)
  })

  it('runs one text at a time', async () => {
    const log: string[] = []
    const embedder = createLocalEmbedder(async () => fakeRuntime(log))
    await Promise.all([embedder.embed(['a b']), embedder.embed(['a'])])
    expect(log).toEqual(['run 4', 'run 3'])
  })

  it('reads a long text only as far as the model can', async () => {
    const log: string[] = []
    const long = Array.from({ length: 1000 }, () => 'w').join(' ')
    await createLocalEmbedder(async () => fakeRuntime(log)).embed([long])
    expect(log).toEqual([`run ${LOCAL_EMBEDDING_MODEL.maxTokens}`])
  })
})

describe('pooling @SC-988', () => {
  it('averages the attended tokens and leaves the padded ones out', () => {
    const data = [1, 0, 3, 0, 100, 100]
    expect(meanPool(data, [1, 1, 0], 2)).toEqual([1, 0])
  })

  it('keeps the closing marker when a text is cut', () => {
    expect(truncate({ ids: [101, 1, 2, 3, 102], attentionMask: [1, 1, 1, 1, 1] }, 3)).toEqual({ ids: [101, 1, 102], attentionMask: [1, 1, 1] })
  })
})
