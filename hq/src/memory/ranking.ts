/**
 * Recall's ranking (memory and knowledge spec, Recall by meaning, ranked by hit rate): score = similarity × warmth,
 * where warmth is a log boost by how often an item was recalled and used, so one popular item cannot crowd out the
 * rest, and a decay by the time since it was last recalled, floored so last year's item stays reachable by a direct
 * question. Pinned items come first; the result is cut at k and at a token budget, naming what the budget cut.
 */

/** Below this similarity a query has not found the item at all. */
export const RECALL_MIN_SIMILARITY = 0.3
const USE_BOOST = 0.1
/** A use counts more than a recall: the lead relied on it. */
const USED_WEIGHT = 2
const HALF_LIFE_DAYS = 90
const DECAY_FLOOR = 0.6
const DAY_MS = 24 * 60 * 60 * 1000

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

export interface Warmth {
  recallCount: number
  usedCount: number
  lastRecalledAt: Date | null
  updatedAt: Date
}

export function warmth(item: Warmth, now: Date): number {
  const boost = 1 + USE_BOOST * Math.log1p(item.recallCount + USED_WEIGHT * item.usedCount)
  const since = item.lastRecalledAt ?? item.updatedAt
  const days = Math.max(0, now.getTime() - since.getTime()) / DAY_MS
  return boost * Math.max(DECAY_FLOOR, 0.5 ** (days / HALF_LIFE_DAYS))
}

/** About four characters a token, with a little for the key and provenance each item carries. */
export function itemTokens(item: { title: string; body: string }): number {
  return Math.ceil((item.title.length + item.body.length + 40) / 4)
}

export interface Candidate extends Warmth {
  key: string
  title: string
  body: string
  pinned: boolean
  similarity: number
}

export type Ranked<T extends Candidate> = T & { score: number }

export function rank<T extends Candidate>(
  candidates: readonly T[],
  options: { k: number; tokenBudget: number; now: Date; minSimilarity?: number },
): { items: Ranked<T>[]; cut: string[] } {
  const floor = options.minSimilarity ?? RECALL_MIN_SIMILARITY
  const ordered = candidates
    .filter(c => c.similarity >= floor)
    .map(c => ({ ...c, score: c.similarity * warmth(c, options.now) }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score)
    .slice(0, Math.max(0, options.k))
  const items: Ranked<T>[] = []
  const cut: string[] = []
  let spent = 0
  for (const item of ordered) {
    const tokens = itemTokens(item)
    if (spent + tokens > options.tokenBudget) {
      cut.push(item.key)
      continue
    }
    spent += tokens
    items.push(item)
  }
  return { items, cut }
}
