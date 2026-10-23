/**
 * The background pass that embeds any memory item whose vector is not in the built-in model: written while it could
 * not embed, or in a model used before. Memory is always searched with that model (models from one place, part 4).
 */
import { prisma } from 'wasp/server'
import type { Embedder } from './contract'
import { embedOrNull } from './memoryRows'
import { embeddingText } from './items'
import { LOCAL_MODEL } from './embedding/localEmbedder'
import { embedderFor as defaultEmbedderFor } from './embedding/embedders'

export const REEMBED_BATCH = 32

/** Embeds one batch of the items whose vector is not in the built-in model. */
export async function reembedBatch(embedderFor: (model: string) => Embedder = defaultEmbedderFor): Promise<{ embedded: number }> {
  const rows = await prisma.memoryItem.findMany({
    where: { OR: [{ embeddingModel: null }, { embeddingModel: { not: LOCAL_MODEL } }] },
    select: { id: true, title: true, body: true, tags: true },
    orderBy: { id: 'asc' },
    take: REEMBED_BATCH,
  })
  if (rows.length === 0) return { embedded: 0 }
  const vectors = await embedOrNull(embedderFor(LOCAL_MODEL), rows.map(embeddingText))
  if (!vectors) return { embedded: 0 }
  let embedded = 0
  for (const [i, row] of rows.entries()) {
    // Only if the item is as it was read: a write since then made its own vector.
    const { count } = await prisma.memoryItem.updateMany({
      where: { id: row.id, title: row.title, body: row.body },
      data: { embedding: vectors[i], embeddingModel: LOCAL_MODEL },
    })
    embedded += count
  }
  return { embedded }
}
