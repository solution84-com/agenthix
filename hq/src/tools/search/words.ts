/**
 * The word half of the tool search (index.ts): a query's words matched against each entry's, each word weighted by
 * how few entries have it, so a distinctive word ("milestone") counts for more than a common one ("task").
 */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'by', 'with', 'at', 'from', 'as', 'is', 'are', 'be',
  'it', 'its', 'this', 'that', 'what', 'which', 'who', 'how', 'do', 'does', 'can', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'there', 'some', 'any', 'all', 'one', 'set', 'get', 'have', 'has', 'want', 'saying', 'please',
])

/** `plan_task` → "plan task"; `milestoneId` → "milestone id". */
export function nameWords(name: string): string {
  return name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

/** A word's plain form: "tasks" and "task's" are "task". */
function stem(word: string): string {
  const bare = word.replace(/'s$/, '')
  if (bare.length > 4 && bare.endsWith('ies')) return `${bare.slice(0, -3)}y`
  if (bare.length > 3 && bare.endsWith('s') && !bare.endsWith('ss')) return bare.slice(0, -1)
  return bare
}

/** The words of a text, in order, plain and lower case. */
export function wordsOf(text: string): string[] {
  return (nameWords(text).match(/[\p{L}\p{N}']+/gu) ?? []).map(stem).filter(w => w.length > 0)
}

/** A word of the query found in a tool's name counts this much more than one found only in its text. */
const IN_NAME = 0.5

/**
 * Each text's share of the query's distinctive words, from 0 (none) to 1 (every one, each in the tool's name too).
 * `names`: each text's tool name, where a word found counts for more.
 */
export function wordScores(query: string, texts: readonly string[], names: readonly string[] = []): number[] {
  const asked = [...new Set(wordsOf(query).filter(w => !STOP.has(w)))]
  const held = texts.map(t => new Set(wordsOf(t)))
  const named = texts.map((_, i) => new Set(wordsOf(names[i] ?? '')))
  if (asked.length === 0) return texts.map(() => 0)
  const n = texts.length
  const weight = (w: string) => Math.log(1 + n / Math.max(1, held.filter(h => h.has(w)).length))
  const total = asked.reduce((sum, w) => sum + weight(w), 0) * (1 + IN_NAME)
  return held.map((h, i) => asked.reduce((sum, w) => sum + (h.has(w) ? weight(w) : 0) + (named[i]!.has(w) ? IN_NAME * weight(w) : 0), 0) / total)
}
