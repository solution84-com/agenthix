/**
 * A task's rank (D14): one per task, project-wide, the order every board sorts by and an agent's Start follows. It is
 * a string compared by code unit, so a task moves by writing its own rank alone, between its two new neighbours.
 * It is never shown as a number.
 *
 * Digits are 0-9 then a-z (base 36, in code-unit order). A rank never ends in `0`, so there is always room between
 * two ranks.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length
const RANK = /^[0-9a-z]*[1-9a-z]$/
export const RANK_MAX_LENGTH = 128

export function isRank(value: unknown): value is string {
  return typeof value === 'string' && value.length <= RANK_MAX_LENGTH && RANK.test(value)
}

export function compareRanks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const digit = (s: string, i: number, fill: number): number => (i < s.length ? DIGITS.indexOf(s[i]!) : fill)

/**
 * A rank strictly between `before` and `after`; null for either means the start or the end of the order. Throws
 * when `before` is not below `after`, or either is not a rank.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && !isRank(before)) throw new Error(`not a rank: ${before}`)
  if (after !== null && !isRank(after)) throw new Error(`not a rank: ${after}`)
  if (before !== null && after !== null && compareRanks(before, after) >= 0) throw new Error(`${before} is not before ${after}`)
  const lo = before ?? ''
  let out = ''
  for (let i = 0; ; i++) {
    const a = digit(lo, i, 0)
    const b = after === null ? BASE : digit(after, i, BASE)
    if (b - a > 1) return out + DIGITS[Math.floor((a + b) / 2)]
    // The digits are equal or adjacent: keep `before`'s digit and look further along for room.
    out += DIGITS[a]
    if (b - a === 1) return out + rankAfterTail(lo.slice(i + 1))
  }
}

// A rank above every string starting with `tail`'s prefix, within one more digit.
function rankAfterTail(tail: string): string {
  let out = ''
  for (let i = 0; ; i++) {
    const a = digit(tail, i, 0)
    if (a < BASE - 1) return out + DIGITS[Math.floor((a + BASE) / 2)]
    out += DIGITS[a]
  }
}

/** `count` ranks in order, evenly spread: for a project's first tasks, or tasks added together. */
export function ranksBetween(before: string | null, after: string | null, count: number): string[] {
  const out: string[] = []
  let lo = before
  for (let i = 0; i < count; i++) {
    lo = rankBetween(lo, after)
    out.push(lo)
  }
  return out
}
