/**
 * The probe before a turn (memory and knowledge spec, What decides a recall): the composed query embedded once —
 * in each model the reachable items were embedded with, while a switch re-embeds — compared with every item the
 * principal may read, and sorted into the tiers. The vector is used here and dropped; nothing is stored.
 *
 * It reads and does not write: the hook that runs it (turnMemory.ts) records what the turn was shown. It searches
 * the store's rows itself, rather than through `MemoryService.recallByQuery`, because recall counts as a read that
 * warms what it returns, and an item the probe passes over has not been read by anyone.
 */
import { prisma } from 'wasp/server'
import { RECALL_TOKEN_BUDGET } from '../../shared/memory/protocol'
import type { Embedder, MemoryPrincipal, Probe, ProbeResult, RecalledItem } from '../../memory/contract'
import { reachableTargets } from '../../memory/scopes'
import { ITEM_SELECT, embedOrNull, embeddingState, recalledItem, type EmbeddingState, type ItemRow } from '../../memory/memoryRows'
import { cosine, itemTokens, RECALL_MIN_SIMILARITY, warmth } from '../../memory/ranking'
import { embedderFor as defaultEmbedderFor } from '../../memory/embedding/embedders'
import { currentBars, type Bars } from '../../memory/barTuner'
import { tiersOf } from './tiers'

export interface ProbeDeps {
  /** The items not archived in the scopes the principal reaches. */
  rows(principal: MemoryPrincipal): Promise<ItemRow[]>
  state(): Promise<EmbeddingState>
  embedderFor(model: string): Embedder
  bars(): Promise<Bars>
  now(): Date
}

/** What the probe gives a turn: the tiers, the pinned items, and the similarity of everything it compared. */
export interface TurnProbe extends ProbeResult {
  probable: (ProbeResult['probable'][number] & { itemId: string })[]
  pinned: RecalledItem[]
  /** Each compared item's similarity to the composed query, kept for the turn only (probeScores.ts). */
  scores: Map<string, number>
}

/** Pinned items, latest first, up to the recall budget: always present, so they must stay small. */
function pinnedWithin(rows: readonly ItemRow[]): RecalledItem[] {
  const pinned = rows.filter(r => r.pinned).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  const kept: RecalledItem[] = []
  let spent = 0
  for (const row of pinned) {
    spent += itemTokens(row)
    if (spent > RECALL_TOKEN_BUDGET) break
    kept.push(recalledItem(row))
  }
  return kept
}

async function queryVectors(deps: ProbeDeps, rows: readonly ItemRow[], query: string): Promise<Map<string, number[]>> {
  const state = await deps.state()
  const models = [state.current, state.next].filter((m): m is string => !!m && rows.some(r => r.embeddingModel === m))
  const vectors = new Map<string, number[]>()
  for (const model of models) {
    const vector = (await embedOrNull(deps.embedderFor(model), [query]))?.[0]
    if (vector) vectors.set(model, vector)
  }
  return vectors
}

export function createProbe(deps: ProbeDeps): (principal: MemoryPrincipal, composedQuery: string) => Promise<TurnProbe> {
  return async (principal, composedQuery) => {
    const rows = await deps.rows(principal)
    const pinned = pinnedWithin(rows)
    const empty: TurnProbe = { certain: [], probable: [], pinned, scores: new Map() }
    if (!composedQuery.trim() || rows.length === 0) return empty
    const vectors = await queryVectors(deps, rows, composedQuery)
    if (vectors.size === 0) return empty

    const at = deps.now()
    const scores = new Map<string, number>()
    const scored = rows.flatMap(row => {
      const q = row.embeddingModel ? vectors.get(row.embeddingModel) : undefined
      if (!q) return []
      const similarity = cosine(q, row.embedding)
      scores.set(row.id, similarity)
      return similarity >= RECALL_MIN_SIMILARITY ? [{ itemId: row.id, row, similarity, score: similarity * warmth(row, at) }] : []
    })
    const shown = new Set(pinned.map(p => p.itemId))
    const tiers = tiersOf(scored, await deps.bars(), shown)
    return {
      certain: tiers.certain.map(s => recalledItem(s.row, { similarity: s.similarity, score: s.score })),
      probable: tiers.probable.map(s => ({ itemId: s.row.id, key: s.row.key, title: s.row.title, similarity: s.similarity })),
      pinned,
      scores,
    }
  }
}

export const probe = createProbe({
  async rows(principal) {
    const scopeKeys = reachableTargets(principal).map(t => t.scopeKey)
    if (scopeKeys.length === 0) return []
    return prisma.memoryItem.findMany({ where: { scopeKey: { in: scopeKeys }, archived: false }, select: ITEM_SELECT })
  },
  state: embeddingState,
  embedderFor: model => defaultEmbedderFor(model),
  bars: currentBars,
  now: () => new Date(),
}) satisfies Probe
