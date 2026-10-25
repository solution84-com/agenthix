/**
 * Whether a variable's value looks like a secret (spec part 3, *Saving a variable that looks like a secret*): a key's
 * `BEGIN` line, a known token prefix, or a long random string. Only a question for the person: the answer is why, in
 * words that never repeat the value, or null.
 */

const KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*(PRIVATE KEY|KEY|CERTIFICATE)[A-Z ]*-----/

const PREFIXES: ReadonlyArray<{ re: RegExp; what: string }> = [
  { re: /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/, what: 'a GitHub token' },
  { re: /^github_pat_[A-Za-z0-9_]{10,}/, what: 'a GitHub token' },
  { re: /^glpat-[A-Za-z0-9_-]{10,}/, what: 'a GitLab token' },
  { re: /^xox[abpors]-[A-Za-z0-9-]{4,}/, what: 'a Slack token' },
  { re: /^(AKIA|ASIA)[A-Z0-9]{16}/, what: 'an AWS access key' },
  { re: /^AIza[A-Za-z0-9_-]{20,}/, what: 'a Google API key' },
  { re: /^(sk|rk|pk)[-_](live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{6,}/, what: 'an API key' },
  { re: /^npm_[A-Za-z0-9]{20,}/, what: 'an npm token' },
  { re: /^(SG|xapp)[.-][A-Za-z0-9_.-]{10,}/, what: 'an API token' },
  { re: /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, what: 'a signed token (JWT)' },
]

/** A run with no separators of this length or more is a candidate for a random string. */
const RANDOM_MIN = 32
/** A hex run this long is a key of 32 bytes or more: a 40-digit commit id is not flagged. */
const HEX_MIN = 64
/** Bits per character above which a run reads as random rather than as words. */
const ENTROPY_MIN = 4

function entropy(s: string): number {
  const counts = new Map<string, number>()
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) bits -= (n / s.length) * Math.log2(n / s.length)
  return bits
}

function randomRun(value: string): boolean {
  for (const run of value.match(/[A-Za-z0-9+/=_]+/g) ?? []) {
    if (run.length >= HEX_MIN && /^[0-9a-fA-F]+$/.test(run)) return true
    if (run.length < RANDOM_MIN) continue
    const mixed = /[a-z]/.test(run) && /[A-Z]/.test(run) && /[0-9]/.test(run)
    if (mixed && entropy(run) >= ENTROPY_MIN) return true
  }
  return false
}

export function looksLikeSecret(value: string): string | null {
  if (KEY_BEGIN.test(value)) return 'It holds a key file’s BEGIN line.'
  const trimmed = value.trim()
  for (const p of PREFIXES) if (p.re.test(trimmed)) return `It starts the way ${p.what} does.`
  if (randomRun(value)) return 'It holds a long random string, the way a key or a token does.'
  return null
}
