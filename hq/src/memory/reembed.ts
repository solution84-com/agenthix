/**
 * One embedding model per organisation, and switching it (memory and knowledge spec, Recall by meaning): the
 * setting names the model to move to, every item is embedded again in the background, and the old vectors keep
 * serving until the last item is done — recall searches each item in the model it was embedded with. The same
 * pass gives a vector to any item written while its model could not embed.
 */
import { prisma } from 'wasp/server'
import type { MemoryMeasurements } from '../shared/memory/protocol'
import type { Embedder } from './contract'
import { embedOrNull, embeddingState, writingModel } from './memoryRows'
import { embeddingText } from './items'
import { LOCAL_MODEL } from './embedding/localEmbedder'
import { parseProviderModel } from './embedding/providerEmbedder'
import { embedderFor as defaultEmbedderFor } from './embedding/embedders'
import { readApiKey } from '../model-access/apiKeys'
import { MemoryRefused } from './memoryService'

export const REEMBED_BATCH = 32

/** Why the organisation cannot move to this model, or null when it can. */
export async function embeddingModelRefusal(model: string): Promise<string | null> {
  if (model === LOCAL_MODEL) return null
  const parsed = parseProviderModel(model)
  if (!parsed) return `"${model}" is not an embedding model HQ can use: name the local model or <provider>/<model>.`
  if (!(await readApiKey('org', 'org', parsed.provider))) {
    return `The organisation has no ${parsed.provider} key, which its embedding model would be paid with.`
  }
  return null
}

/** Starts moving every item to `model`, or stops a move already under way when it names the current model. */
export async function switchEmbeddingModel(model: string): Promise<void> {
  const refusal = await embeddingModelRefusal(model)
  if (refusal) throw new MemoryRefused(refusal)
  const org = await prisma.org.findFirst({ select: { id: true, memoryEmbeddingModel: true } })
  if (!org) throw new MemoryRefused('There is no organisation to set the embedding model of.')
  await prisma.org.update({
    where: { id: org.id },
    data: { memoryEmbeddingNext: model === org.memoryEmbeddingModel ? null : model },
  })
}

/**
 * Embeds one batch of the items whose vector is not in the model new items are written with. When none is left
 * and a switch was under way, the switch is finished: the new model becomes the organisation's.
 */
export async function reembedBatch(embedderFor: (model: string) => Embedder = defaultEmbedderFor): Promise<{ embedded: number; switched: boolean }> {
  const state = await embeddingState()
  const model = writingModel(state)
  const rows = await prisma.memoryItem.findMany({
    where: { OR: [{ embeddingModel: null }, { embeddingModel: { not: model } }] },
    select: { id: true, title: true, body: true, tags: true },
    orderBy: { id: 'asc' },
    take: REEMBED_BATCH,
  })
  if (rows.length === 0) {
    if (!state.next) return { embedded: 0, switched: false }
    const { count } = await prisma.org.updateMany({
      where: { memoryEmbeddingNext: state.next },
      data: { memoryEmbeddingModel: state.next, memoryEmbeddingNext: null },
    })
    return { embedded: 0, switched: count > 0 }
  }
  const vectors = await embedOrNull(embedderFor(model), rows.map(embeddingText))
  if (!vectors) return { embedded: 0, switched: false }
  let embedded = 0
  for (const [i, row] of rows.entries()) {
    // Only if the item is as it was read: a write since then made its own vector.
    const { count } = await prisma.memoryItem.updateMany({
      where: { id: row.id, title: row.title, body: row.body },
      data: { embedding: vectors[i], embeddingModel: model },
    })
    embedded += count
  }
  return { embedded, switched: false }
}

/** How far a switch of model has got, for the memory screen; null when none is under way. */
export async function reembedProgress(): Promise<MemoryMeasurements['reembedding']> {
  const state = await embeddingState()
  if (!state.next) return null
  const [total, done] = await Promise.all([
    prisma.memoryItem.count(),
    prisma.memoryItem.count({ where: { embeddingModel: state.next } }),
  ])
  return { to: state.next, done, total }
}
