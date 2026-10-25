/**
 * The fixed refusals grep gives (spec S1, S6), the per-caller call limit (S2), and how ripgrep's own failure is read
 * without passing any of its text on: its message can echo the pattern.
 */
import { GREP_LIMITS, type GrepParams } from './grepArgs.js'

export type GrepRefusal =
  | 'invalid-parameter'
  | 'pattern-too-long'
  | 'pattern-look-around'
  | 'pattern-backreference'
  | 'pattern-invalid'
  | 'glob-invalid'
  | 'too-slow'
  | 'rate-limited'
  | 'search-failed'

const MESSAGES: Record<Exclude<GrepRefusal, 'invalid-parameter'>, string> = {
  'pattern-too-long': `The pattern is longer than ${GREP_LIMITS.patternChars} characters, so the search was not run. Use a shorter pattern, or narrow the search with path or glob.`,
  // ripgrep's own words for the two things its regex engine leaves out (S1).
  'pattern-look-around': 'regex parse error: look-around, including look-ahead and look-behind, is not supported. Rewrite the pattern without look-around.',
  'pattern-backreference': 'regex parse error: backreferences are not supported. Rewrite the pattern without backreferences.',
  'pattern-invalid': 'The pattern is not a valid regular expression (ripgrep\'s syntax). Escape special characters such as ( [ { . * + ? with a backslash, and set multiline to match across lines.',
  'glob-invalid': 'The glob is not a valid file pattern. Use patterns such as "*.md" or "**/*.{md,txt}".',
  'too-slow': `The search took longer than ${GREP_LIMITS.timeoutMs / 1000} seconds and was stopped. Narrow it with path or glob, or use a simpler pattern.`,
  'rate-limited': `Too many searches: at most ${GREP_LIMITS.callsPerMinute} a minute. Wait a minute before searching again, or work from what earlier searches found.`,
  'search-failed': 'The search could not be run. Try again; if it keeps failing, an administrator of HQ can find the cause in its log.',
}

export function grepRefusalMessage(reason: GrepRefusal, parameter?: keyof GrepParams): string {
  if (reason === 'invalid-parameter') {
    return `The parameter ${parameter ?? 'pattern'} is not valid, so the search was not run. Check its type and range, and try again.`
  }
  return MESSAGES[reason]
}

/** What ripgrep's stderr on exit 2 says about the pattern or glob, or nothing when the failure was elsewhere. */
export function classifyRgError(stderr: string): Extract<GrepRefusal, `pattern-${string}` | 'glob-invalid'> | undefined {
  if (stderr.includes('regex parse error') || stderr.includes('is not allowed in a regex')) {
    // Both errors end with the same hint naming both, so the error line itself decides.
    if (stderr.includes('error: look-around')) return 'pattern-look-around'
    if (stderr.includes('error: backreferences are not supported')) return 'pattern-backreference'
    return 'pattern-invalid'
  }
  if (stderr.includes('error parsing glob')) return 'glob-invalid'
  if (/regex|literal/i.test(stderr) && !stderr.includes('(os error')) return 'pattern-invalid'
  return undefined
}

/** At most `limit` calls in any `windowMs`, per caller key, in memory. */
export class GrepRateLimiter {
  private readonly calls = new Map<string, number[]>()

  constructor(
    private readonly limit: number = GREP_LIMITS.callsPerMinute,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records the call and says whether it may run. A refused call is not counted. */
  take(key: string): boolean {
    const t = this.now()
    const recent = (this.calls.get(key) ?? []).filter(at => t - at < this.windowMs)
    if (recent.length >= this.limit) {
      this.calls.set(key, recent)
      return false
    }
    recent.push(t)
    this.calls.set(key, recent)
    if (this.calls.size > 10_000) this.prune(t)
    return true
  }

  private prune(t: number): void {
    for (const [key, times] of this.calls) {
      if (times.every(at => t - at >= this.windowMs)) this.calls.delete(key)
    }
  }
}

export const defaultGrepRateLimiter = new GrepRateLimiter()
