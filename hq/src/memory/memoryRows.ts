/**
 * What the store reads and writes besides its own rules: embedding a text without letting a failed embed fail the write, and an item row as recall returns it.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { MemoryItemKindValue } from '../shared/memory/protocol'
import type { Embedder, RecalledItem } from './contract'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Memory')

/** Latched so an outage logs once, not once per write; cleared by the next embed that works. */
let embedFailureWarned = false

/**
 * The texts' vectors, or null when the model cannot embed now. An item is kept without one and the background
 * re-embed gives it one later; until then it is found by key, not by meaning.
 */
export async function embedOrNull(embedder: Embedder, texts: string[]): Promise<number[][] | null> {
  try {
    const vectors = await embedder.embed(texts)
    embedFailureWarned = false
    return vectors
  } catch (error) {
    if (!embedFailureWarned) {
      embedFailureWarned = true
      logger.warn(`Embedding with ${embedder.model} failed; items are kept and embedded later: ${error instanceof Error ? error.message : String(error)}`)
    }
    return null
  }
}

export const ITEM_SELECT = {
  id: true, key: true, scopeKey: true, userId: true, agentId: true, placeType: true, placeId: true, title: true,
  body: true, kind: true, tags: true, archived: true, embedding: true, embeddingModel: true, recallCount: true, usedCount: true, lastRecalledAt: true,
  updatedAt: true,
} satisfies Prisma.MemoryItemSelect

export type ItemRow = Prisma.MemoryItemGetPayload<{ select: typeof ITEM_SELECT }>

export function recalledItem(row: ItemRow, ranked?: { similarity: number; score: number }): RecalledItem {
  return {
    itemId: row.id,
    key: row.key,
    title: row.title,
    body: row.body,
    kind: row.kind as MemoryItemKindValue,
    tags: row.tags,
    ...(ranked ? { similarity: ranked.similarity, score: ranked.score } : {}),
    writtenAt: row.updatedAt.toISOString(),
  }
}

/** Items handed to a reader were recalled now: the warmth recall ranks by. */
export async function markRecalled(ids: string[], now: Date): Promise<void> {
  if (ids.length === 0) return
  await prisma.memoryItem.updateMany({
    where: { id: { in: ids } },
    data: { recallCount: { increment: 1 }, lastRecalledAt: now },
  })
}
