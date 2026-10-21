/**
 * The embedder for a model setting — `local`, or `<provider>/<model>` — made once and kept, so the local model
 * loads once per process. Tests replace this module with the deterministic fake (test/fakes/embedders.ts).
 */
import type { Embedder } from '../contract'
import { createLocalEmbedder, LOCAL_MODEL } from './localEmbedder'
import { createProviderEmbedder } from './providerEmbedder'

const made = new Map<string, Embedder>()

export function embedderFor(model: string): Embedder {
  let embedder = made.get(model)
  if (!embedder) {
    embedder = model === LOCAL_MODEL ? createLocalEmbedder() : createProviderEmbedder(model)
    made.set(model, embedder)
  }
  return embedder
}
