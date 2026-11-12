/**
 * The probe before a turn (memory and knowledge spec, What decides a recall): the composed query embedded once —
 * in the built-in model — compared with every item whose scope lets the principal recall it (the scope check comes
 * first, ADR-0188), and sorted into the tiers with the Rule weight. The vector is used here and dropped; nothing is
 * stored.
 *
 * It reads and does not write: the hook that runs it (turnMemory.ts) records what the turn was shown. It searches
 * the store's rows itself, rather than through `MemoryService.recallByQuery`, because recall counts as a read that
 * warms what it returns, and an item the probe passes over has not been read by anyone.
 */
import { prisma } from 'wasp/server'
import type { Embedder, MemoryPrincipal, Probe, ProbeResult } from '../../memory/contract'
import { recallableWhere } from '../../memory/scopes'
import { ITEM_SELECT, embedOrNull, recalledItem, type ItemRow } from '../../memory/memoryRows'
import { cosine, RECALL_MIN_SIMILARITY, warmth } from '../../memory/ranking'
import { embedderFor as defaultEmbedderFor } from '../../memory/embedding/embedders'
import { LOCAL_MODEL } from '../../memory/embedding/localEmbedder'
import { currentBars, type Bars } from '../../memory/barTuner'
import { tiersOf } from './tiers'

export interface ProbeDeps {
  /** The items not archived whose scope lets the principal recall them. */
  rows(principal: MemoryPrincipal): Promise<ItemRow[]>
  embedderFor(model: string): Embedder
  bars(): Promise<Bars>
  now(): Date
}

/** What the probe gives a turn: the tiers, and the similarity of everything it compared. */
export interface TurnProbe extends ProbeResult {
  probable: (ProbeResult['probable'][number] & { itemId: string })[]
  /** Each compared item's similarity to the composed query, kept for the turn only (probeScores.ts). */
  scores: Map<string, number>
}

async function queryVectors(deps: ProbeDeps, rows: readonly ItemRow[], query: string): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>()
  if (!rows.some(r => r.embeddingModel === LOCAL_MODEL)) return vectors
  const vector = (await embedOrNull(deps.embedderFor(LOCAL_MODEL), [query]))?.[0]
  if (vector) vectors.set(LOCAL_MODEL, vector)
  return vectors
}

export function createProbe(deps: ProbeDeps): (principal: MemoryPrincipal, composedQuery: string) => Promise<TurnProbe> {
  return async (principal, composedQuery) => {
    const rows = await deps.rows(principal)
    const empty: TurnProbe = { certain: [], probable: [], scores: new Map() }
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
      return similarity >= RECALL_MIN_SIMILARITY ? [{ itemId: row.id, row, kind: row.kind, similarity, score: similarity * warmth(row, at) }] : []
    })
    const tiers = tiersOf(scored, await deps.bars())
    return {
      certain: tiers.certain.map(s => ({ ...recalledItem(s.row, { similarity: s.similarity, score: s.score }), weighted: s.weighted })),
      probable: tiers.probable.map(s => ({ itemId: s.row.id, key: s.row.key, title: s.row.title, similarity: s.similarity })),
      scores,
    }
  }
}

export const probe = createProbe({
  async rows(principal) {
    const reach = recallableWhere(principal)
    if (!reach) return []
    return prisma.memoryItem.findMany({ where: { AND: [reach, { archived: false }] }, select: ITEM_SELECT })
  },
  embedderFor: model => defaultEmbedderFor(model),
  bars: currentBars,
  now: () => new Date(),
}) satisfies Probe
