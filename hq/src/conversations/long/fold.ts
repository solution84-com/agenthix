/**
 * What a compaction folds (long conversations spec, Compaction in segments): everything in the window older than
 * the low mark, so the newest messages worth about `keepTokens` stay verbatim. Never a message this turn answers, or
 * one still waiting for a turn: those come after the fold. The window it leaves starts with the person's side,
 * as a provider expects a conversation to. Pure.
 */
export interface WindowMessage {
  seq: number
  createdAt: string
  /** What it costs in the lead's context; 0 for a message the lead never reads. */
  tokens: number
  /** Whose side the lead reads it as; null for a message the lead never reads. */
  side: 'user' | 'assistant' | null
}

export interface FoldRange {
  firstSeq: number
  lastSeq: number
  firstAt: string
  lastAt: string
  /** Every message folded, oldest first. */
  seqs: number[]
}

/**
 * `window`: the messages since the last segment, oldest first. `stopAtSeq`: the first message that must stay —
 * this turn's input, or the first still waiting; folding ends before it. Null when nothing the lead reads would fold.
 */
export function foldRange(window: readonly WindowMessage[], keepTokens: number, stopAtSeq?: number): FoldRange | null {
  const ordered = [...window].sort((a, b) => a.seq - b.seq)
  const stop = stopAtSeq ?? Number.POSITIVE_INFINITY
  let kept = ordered.filter(m => m.seq >= stop).reduce((sum, m) => sum + m.tokens, 0)
  const candidates = ordered.filter(m => m.seq < stop)
  let cut = candidates.length
  while (cut > 0 && kept + candidates[cut - 1]!.tokens <= keepTokens) {
    cut--
    kept += candidates[cut]!.tokens
  }
  const rest = [...candidates, ...ordered.filter(m => m.seq >= stop)]
  const firstKeptSide = (from: number) => rest.slice(from).find(m => m.side !== null)?.side ?? null
  while (cut > 0 && firstKeptSide(cut) === 'assistant') cut--
  const folded = candidates.slice(0, cut)
  if (!folded.some(m => m.tokens > 0)) return null
  const first = folded[0]!
  const last = folded[folded.length - 1]!
  return { firstSeq: first.seq, lastSeq: last.seq, firstAt: first.createdAt, lastAt: last.createdAt, seqs: folded.map(m => m.seq) }
}
