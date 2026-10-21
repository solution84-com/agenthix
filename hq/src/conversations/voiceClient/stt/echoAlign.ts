/**
 * Lines the words the speech service heard up against what the agent was saying then, in order. Echo comes back in
 * the agent's order, misheard here and there; the person's words do not follow it, even when they are common words
 * the agent also used. So a heard word is:
 *
 * - **the agent's** when it continues the agent's words from the heard word before it (loosely: a misheard word in
 *   that place still counts), or begins such a run;
 * - **either** when it is one of the agent's words of that moment but in no such run ("the", "no" on its own);
 * - **the person's own** otherwise.
 */

export function bareWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]!
}

/** One of the agent's words, in the order said, and when it may be heard back (its sentence's window). */
export type AgentWord = { word: string; from: number; to: number }
/** A heard word, and the earliest and latest it may have been spoken. */
export type HeardSpan = { text: string; earliest: number; latest: number }
export type Owner = 'agent' | 'either' | 'own'

/** The same word heard on its own: equal, or a letter apart in a long word (two in a very long one). */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const longest = Math.max(a.length, b.length)
  if (longest < 6) return false
  return editDistance(a, b) <= (longest >= 9 ? 2 : 1)
}

/** The word expected next, heard loosely: a letter apart, or its start heard and its length about right. */
function follows(heard: string, expected: string): boolean {
  if (sameWord(heard, expected) || editDistance(heard, expected) <= 1) return true
  return heard.length >= 2 && heard.slice(0, 2) === expected.slice(0, 2) && Math.abs(heard.length - expected.length) <= 1
}

export function alignToAgent(heard: HeardSpan[], agent: AgentWord[]): Owner[] {
  const near = (h: HeardSpan, a: AgentWord) => h.latest >= a.from && h.earliest <= a.to
  const words = heard.map(h => bareWord(h.text))
  const free: Set<number>[] = []
  const next: Set<number>[] = []
  heard.forEach((h, i) => {
    free[i] = new Set(agent.flatMap((a, p) => (near(h, a) && sameWord(words[i]!, a.word) ? [p] : [])))
    const before = i > 0 ? new Set([...free[i - 1]!, ...next[i - 1]!]) : new Set<number>()
    next[i] = new Set([...before].map(p => p + 1).filter(p => agent[p] !== undefined && near(h, agent[p]!) && follows(words[i]!, agent[p]!.word)))
  })
  return heard.map((_, i) => {
    if (next[i]!.size > 0 || (free[i]!.size > 0 && (next[i + 1]?.size ?? 0) > 0)) return 'agent'
    return free[i]!.size > 0 ? 'either' : 'own'
  })
}
