/**
 * A parameter's pattern (spec part 1, *Parameters*): a JavaScript regular expression, compiled with the `u` flag,
 * that the whole value must match. hq checks every value against it before a run, so two things are decided here:
 *
 * - **Whether it may be a pattern at all.** An agent writes it and an agent chooses the values, and hq matches one
 *   against the other on its own event loop, so a pattern that can backtrack without end (`(a+)+$`) is refused:
 *   no back-references or lookarounds, and no repeated group that holds a repeat or an alternation. Repeats side by
 *   side backtrack too, in time that grows as the value's length to the power of their number (`\w*\w*\w*x`), so a
 *   pattern whose repeats and alternatives together give more ways to match a value than two unbounded repeats do
 *   is refused as well.
 * - **Whether it can match a value starting with `-`**, which a command would read as an option. That is reported,
 *   not refused (R1 rule 11). The reading is conservative: anything this module can't follow counts as "can".
 */
import { WORKFLOW_LIMITS } from './definition.js'

export const PARAMETER_PATTERN_MAX = 200

const VALUE_MAX = WORKFLOW_LIMITS.parameterValueMax
/** Ways a value may be split among a pattern's repeats and alternatives: two unbounded repeats over the longest value. */
const WAYS_MAX = (VALUE_MAX + 1) ** 2

type Item = { atom: Atom; min: number; max: number }
type Atom =
  | { kind: 'set'; dash: boolean }
  | { kind: 'empty' }
  | { kind: 'group'; alt: Item[][] }

export type PatternReading =
  | { ok: true; canStartWithDash: boolean }
  | { ok: false; reason: string }

class Refused extends Error {}

const DASH = 0x2d

export function readParameterPattern(pattern: string): PatternReading {
  if (pattern.length === 0) return { ok: false, reason: 'A pattern cannot be empty.' }
  if (pattern.length > PARAMETER_PATTERN_MAX) return { ok: false, reason: `A pattern is at most ${PARAMETER_PATTERN_MAX} characters.` }
  try {
    new RegExp(pattern, 'u')
  } catch {
    return { ok: false, reason: `"${pattern}" is not a regular expression.` }
  }
  try {
    const alt = new Reader(pattern).alternation()
    if (altWays(alt) > WAYS_MAX) {
      return { ok: false, reason: 'A pattern cannot have this many repeats side by side: there are too many ways to match a value, and it could take hq too long to check. Use fewer *, + or ? and {m,n}.' }
    }
    return { ok: true, canStartWithDash: altStartsWithDash(alt) }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.message }
    throw e
  }
}

/** Whether `value` matches all of `pattern`. Call only on a pattern `readParameterPattern` accepted. */
export function matchesParameterPattern(pattern: string, value: string): boolean {
  // The bound on ways above holds for values up to this length only.
  if (value.length > VALUE_MAX) return false
  return new RegExp(`^(?:${pattern})$`, 'u').test(value)
}

class Reader {
  private i = 0
  constructor(private readonly src: string) {}

  alternation(): Item[][] {
    const alt: Item[][] = [this.sequence()]
    while (this.src[this.i] === '|') { this.i++; alt.push(this.sequence()) }
    return alt
  }

  private sequence(): Item[] {
    const items: Item[] = []
    while (this.i < this.src.length && this.src[this.i] !== '|' && this.src[this.i] !== ')') {
      const atom = this.atom()
      const [min, max] = this.quantifier()
      if (max > 1 && atom.kind === 'group' && repeats(atom.alt)) {
        throw new Refused('A pattern cannot repeat a group that itself repeats or has alternatives: it could take hq too long to check.')
      }
      items.push({ atom, min, max })
    }
    return items
  }

  private atom(): Atom {
    const c = this.src[this.i++]
    if (c === '^' || c === '$') return { kind: 'empty' }
    if (c === '.') return { kind: 'set', dash: true }
    if (c === '[') return this.characterClass()
    if (c === '(') {
      if (this.src.startsWith('?:', this.i)) this.i += 2
      else if (this.src.startsWith('?<', this.i) && !/^\?<[=!]/.test(this.src.slice(this.i))) this.i = this.src.indexOf('>', this.i) + 1
      else if (this.src[this.i] === '?') throw new Refused('A pattern cannot use lookarounds or group flags.')
      const alt = this.alternation()
      this.i++ // ')'
      return { kind: 'group', alt }
    }
    if (c === '\\') return this.escapeAtom()
    return { kind: 'set', dash: c.codePointAt(0) === DASH }
  }

  private escapeAtom(): Atom {
    const c = this.src[this.i]
    if (c === 'b' || c === 'B') { this.i++; return { kind: 'empty' } }
    if (/[1-9]/.test(c) || c === 'k') throw new Refused('A pattern cannot use back-references.')
    const code = this.escapeCode()
    return { kind: 'set', dash: code === undefined || code === DASH }
  }

  /** One escape's code point, or undefined for a class that holds `-` or one this reader doesn't know. */
  private escapeCode(): number | null | undefined {
    const c = this.src[this.i++]
    if ('dws'.includes(c)) return null
    if ('DWSpP'.includes(c)) {
      if ((c === 'p' || c === 'P') && this.src[this.i] === '{') this.i = this.src.indexOf('}', this.i) + 1
      return undefined
    }
    const simple: Record<string, number> = { n: 10, r: 13, t: 9, f: 12, v: 11, '0': 0 }
    if (c in simple) return simple[c]
    if (c === 'c') { this.i++; return null }
    if (c === 'x') { const h = this.src.slice(this.i, this.i + 2); this.i += 2; return parseInt(h, 16) }
    if (c === 'u') {
      if (this.src[this.i] === '{') {
        const end = this.src.indexOf('}', this.i)
        const h = this.src.slice(this.i + 1, end); this.i = end + 1
        return parseInt(h, 16)
      }
      const h = this.src.slice(this.i, this.i + 4); this.i += 4
      return parseInt(h, 16)
    }
    return c.codePointAt(0)
  }

  private characterClass(): Atom {
    const negated = this.src[this.i] === '^'
    if (negated) this.i++
    let contains: boolean | undefined = false
    let first = true
    while (this.src[this.i] !== ']' || first) {
      first = false
      const lo = this.classMember()
      if (this.src[this.i] === '-' && this.src[this.i + 1] !== ']' && this.i + 1 < this.src.length) {
        this.i++
        const hi = this.classMember()
        if (lo === undefined || hi === undefined) contains = undefined
        else if (lo !== null && hi !== null && lo <= DASH && DASH <= hi && contains !== undefined) contains = true
      } else if (lo === undefined) contains = undefined
      else if (lo === DASH && contains !== undefined) contains = true
    }
    this.i++ // ']'
    if (contains === undefined) return { kind: 'set', dash: true }
    return { kind: 'set', dash: negated ? !contains : contains }
  }

  private classMember(): number | null | undefined {
    const c = this.src[this.i++]
    if (c !== '\\') return c.codePointAt(0)
    if (this.src[this.i] === 'b') { this.i++; return 8 }
    if (this.src[this.i] === '-') { this.i++; return DASH }
    return this.escapeCode()
  }

  private quantifier(): [number, number] {
    const c = this.src[this.i]
    let q: [number, number] | null = null
    if (c === '*') { this.i++; q = [0, Infinity] }
    else if (c === '+') { this.i++; q = [1, Infinity] }
    else if (c === '?') { this.i++; q = [0, 1] }
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(this.src.slice(this.i))
      if (m) {
        this.i += m[0].length
        const min = Number(m[1])
        q = [min, m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3])]
      }
    }
    if (!q) return [1, 1]
    if (this.src[this.i] === '?') this.i++
    return q
  }
}

function repeats(alt: Item[][]): boolean {
  if (alt.length > 1) return true
  return alt[0].some(it => it.max > 1 || it.min !== it.max || (it.atom.kind === 'group' && repeats(it.atom.alt)))
}

/**
 * An upper bound on the ways a backtracking engine may try to match one value: a repeat may take each count from its
 * least to its most (no more than the longest value), repeats in sequence multiply and alternatives add. Capped as it
 * goes so it stays a finite number.
 */
function altWays(alt: Item[][]): number {
  let ways = 0
  for (const seq of alt) {
    let seqWays = 1
    for (const it of seq) {
      const counts = Math.max(1, Math.min(it.max, VALUE_MAX) - Math.min(it.min, VALUE_MAX) + 1)
      seqWays = Math.min(seqWays * counts * (it.atom.kind === 'group' ? altWays(it.atom.alt) : 1), WAYS_MAX + 1)
    }
    ways = Math.min(ways + seqWays, WAYS_MAX + 1)
  }
  return ways
}

function nullable(atom: Atom): boolean {
  if (atom.kind === 'empty') return true
  if (atom.kind === 'set') return false
  return atom.alt.some(seq => seq.every(it => it.min === 0 || nullable(it.atom)))
}

function altStartsWithDash(alt: Item[][]): boolean {
  return alt.some(seq => {
    for (const it of seq) {
      if (it.max === 0) continue
      if (atomStartsWithDash(it.atom)) return true
      if (!(it.min === 0 || nullable(it.atom))) return false
    }
    return false
  })
}

function atomStartsWithDash(atom: Atom): boolean {
  if (atom.kind === 'empty') return false
  if (atom.kind === 'set') return atom.dash
  return altStartsWithDash(atom.alt)
}
