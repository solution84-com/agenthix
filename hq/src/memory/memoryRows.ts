/**
 * What the store reads and writes besides its own rules: the organisation's embedding model, embedding a text with
 * it without letting a failed embed fail the write, and an item row as recall returns it.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { MemoryItemKindValue, MemoryScopeValue } from '../shared/memory/protocol'
import type { Embedder, RecalledItem } from './contract'
import { Logger } from '../server/utils/logger'
import { LOCAL_MODEL } from './embedding/localEmbedder'

const logger = new Logger('Memory')

/** The organisation's embedding model, and while a switch re-embeds, the model being moved to. */
export interface EmbeddingState { current: string; next: string | null }

export async function embeddingState(): Promise<EmbeddingState> {
  const org = await prisma.org.findFirst({ select: { memoryEmbeddingModel: true, memoryEmbeddingNext: true } })
  return { current: org?.memoryEmbeddingModel ?? LOCAL_MODEL, next: org?.memoryEmbeddingNext ?? null }
}

/** The model a new vector is made with: the one being moved to, so a switch only ever shrinks what is left. */
export function writingModel(state: EmbeddingState): string {
  return state.next ?? state.current
}

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
  id: true, key: true, scope: true, scopeKey: true, title: true, body: true, kind: true, tags: true, pinned: true,
  archived: true, embedding: true, embeddingModel: true, recallCount: true, usedCount: true, lastRecalledAt: true,
  updatedAt: true,
} satisfies Prisma.MemoryItemSelect

export type ItemRow = Prisma.MemoryItemGetPayload<{ select: typeof ITEM_SELECT }>

export function recalledItem(row: ItemRow, ranked?: { similarity: number; score: number }): RecalledItem {
  return {
    itemId: row.id,
    key: row.key,
    scope: row.scope as MemoryScopeValue,
    title: row.title,
    body: row.body,
    kind: row.kind as MemoryItemKindValue,
    tags: row.tags,
    pinned: row.pinned,
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
