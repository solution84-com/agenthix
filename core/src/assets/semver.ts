/**
 * An asset's version (adr-0157, spec part 2 *Versions* V3): SemVer `major.minor.patch` with an optional pre-release,
 * compared by SemVer precedence. Build metadata (`+…`) is refused: two versions equal in precedence but different
 * as text would give one asset two names for one version. No dependency: the grammar is small and read from
 * untrusted manifests, so every part is bounded.
 */

export type SemVer = { major: number; minor: number; patch: number; prerelease: (string | number)[] }

export const SEMVER_MAX_LENGTH = 64

const NUMERIC = '0|[1-9][0-9]*'
const IDENT = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
const SEMVER = new RegExp(`^(${NUMERIC})\\.(${NUMERIC})\\.(${NUMERIC})(?:-(${IDENT}(?:\\.${IDENT})*))?$`)

export function parseSemVer(text: unknown): SemVer | null {
  if (typeof text !== 'string' || text.length > SEMVER_MAX_LENGTH) return null
  const m = SEMVER.exec(text)
  if (!m) return null
  const [major, minor, patch] = [m[1], m[2], m[3]].map(Number)
  if (![major, minor, patch].every(Number.isSafeInteger)) return null
  const prerelease: (string | number)[] = []
  for (const id of m[4]?.split('.') ?? []) {
    if (!/^[0-9]+$/.test(id)) prerelease.push(id)
    else if (Number.isSafeInteger(Number(id))) prerelease.push(Number(id))
    else return null
  }
  return { major, minor, patch, prerelease }
}

export function isSemVer(text: unknown): text is string {
  return parseSemVer(text) !== null
}

export function formatSemVer(v: SemVer): string {
  const core = `${v.major}.${v.minor}.${v.patch}`
  return v.prerelease.length ? `${core}-${v.prerelease.join('.')}` : core
}

function compareIdentifiers(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Negative when `a` precedes `b`, zero when equal in precedence, positive when it follows. Throws on non-SemVer. */
export function compareSemVer(a: string, b: string): number {
  const x = parseSemVer(a)
  const y = parseSemVer(b)
  if (!x || !y) throw new Error(`not a SemVer version: ${!x ? a : b}`)
  const core = x.major - y.major || x.minor - y.minor || x.patch - y.patch
  if (core !== 0) return core
  // A pre-release precedes its release.
  if (!x.prerelease.length || !y.prerelease.length) return y.prerelease.length - x.prerelease.length
  for (let i = 0; i < Math.min(x.prerelease.length, y.prerelease.length); i++) {
    const c = compareIdentifiers(x.prerelease[i], y.prerelease[i])
    if (c !== 0) return c
  }
  return x.prerelease.length - y.prerelease.length
}
