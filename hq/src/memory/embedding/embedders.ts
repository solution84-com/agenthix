/**
 * The embedder: always hq's built-in model, made once and kept, so it loads once per process. A vector written in
 * any other model is embedded again by the background pass (reembed.ts). Tests replace this module with the
 * deterministic fake (test/fakes/embedders.ts).
 */
import type { Embedder } from '../contract'
import { createLocalEmbedder, LOCAL_MODEL } from './localEmbedder'

const made = new Map<string, Embedder>()

export function embedderFor(_model: string): Embedder {
  let embedder = made.get(LOCAL_MODEL)
  if (!embedder) {
    embedder = createLocalEmbedder()
    made.set(LOCAL_MODEL, embedder)
  }
  return embedder
}
