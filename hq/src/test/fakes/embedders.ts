/**
 * A deterministic stand-in for the embedding models (memory/embedding/embedders.ts), so no test loads a model or
 * calls a provider. Each word hashes to one of the vector's dimensions; texts sharing words point the same way,
 * and the same text always gives the same unit vector.
 */
import { createHash } from 'node:crypto'
import { vi } from 'vitest'
import type * as Real from '../../memory/embedding/embedders'
import type { Embedder } from '../../memory/contract'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

export const FAKE_DIMENSIONS = 384

/** `seed` gives each model its own space: the same text embeds differently under another model. */
export function fakeVector(text: string, dimensions = FAKE_DIMENSIONS, seed = ''): number[] {
  const vector = new Array<number>(dimensions).fill(0)
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    vector[createHash('sha256').update(`${seed}${word}`).digest().readUInt32BE(0) % dimensions] += 1
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0))
  return norm === 0 ? vector : vector.map(v => v / norm)
}

export function createFakeEmbedder(model = 'local', dimensions = FAKE_DIMENSIONS): Embedder & { calls: string[][] } {
  const calls: string[][] = []
  return {
    model,
    dimensions,
    calls,
    async embed(texts) {
      calls.push([...texts])
      return texts.map(text => fakeVector(text, dimensions, model === 'local' ? '' : model))
    },
  }
}

const made = new Map<string, ReturnType<typeof createFakeEmbedder>>()

export const embedderFor: Spy<typeof Real.embedderFor> = vi.fn(fakeEmbedderFor)

function fakeEmbedderFor(model: string): ReturnType<typeof createFakeEmbedder> {
  let embedder = made.get(model)
  if (!embedder) {
    embedder = createFakeEmbedder(model)
    made.set(model, embedder)
  }
  return embedder
}

/** The fake for a model, as `embedderFor` hands it out, for checking what it was asked to embed. */
export function fakeEmbedder(model = 'local'): ReturnType<typeof createFakeEmbedder> {
  return fakeEmbedderFor(model)
}

export function reset(): void {
  made.clear()
  embedderFor.mockReset()
  embedderFor.mockImplementation(fakeEmbedderFor)
}

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./embedders')> extends never ? true : never = true
