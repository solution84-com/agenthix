/**
 * What the probe scored each item it compared, held in this process for the turn that ran it, so an item the lead
 * then needed but the probe passed over can be recorded as missed with the probe's own similarity — the number the
 * bars are tuned on. Only numbers by item id: no text and no vector. Bounded, and forgotten after an hour.
 */
const TTL_MS = 60 * 60 * 1000
const MAX_TURNS = 200

const byTurn = new Map<string, { at: number; scores: Map<string, number> }>()

export function keepScores(turnId: string, scores: Map<string, number>, now = Date.now()): void {
  for (const [id, entry] of byTurn) if (now - entry.at > TTL_MS) byTurn.delete(id)
  byTurn.delete(turnId)
  byTurn.set(turnId, { at: now, scores })
  while (byTurn.size > MAX_TURNS) byTurn.delete(byTurn.keys().next().value!)
}

export function probeScore(turnId: string, itemId: string): number | undefined {
  return byTurn.get(turnId)?.scores.get(itemId)
}

export function forgetScores(): void {
  byTurn.clear()
}
