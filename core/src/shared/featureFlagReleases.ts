/**
 * A released flag lives for one minor release (adr-0172): the release rehearsal asks `flagsOverdue` with the version it
 * is about to prove, and refuses while any flag is named.
 */
import { FEATURE_FLAGS, type FeatureFlagEntry } from './featureFlags.js'

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/
const RELEASED_IN = /^(\d+)\.(\d+)$/

/**
 * The released flags whose minor release is behind the version to be tagged (`0.3.0`, `1.0.0`, `0.2.1`,
 * `0.3.0-rc.1`, with or without a leading `v`). A patch or pre-release of the flag's own minor does not count; a
 * pre-release of a later minor does, so the rehearsal catches the flag before the final. A `releasedIn` that is not
 * `major.minor` is named too, so it cannot slip through. Throws on a version that is not `major.minor.patch`.
 */
export function flagsOverdue(
  version: string, flags: Readonly<Record<string, FeatureFlagEntry>> = FEATURE_FLAGS,
): string[] {
  const v = VERSION.exec(version.trim().replace(/^v/, ''))
  if (!v) throw new Error(`Not a version to tag: ${JSON.stringify(version)}. Expected major.minor.patch, as 0.3.0.`)
  const [major, minor] = [Number(v[1]), Number(v[2])]
  return Object.entries(flags).flatMap(([name, entry]) => {
    if (entry.stage !== 'released') return []
    const r = RELEASED_IN.exec(entry.releasedIn)
    if (!r) return [name]
    const [rMajor, rMinor] = [Number(r[1]), Number(r[2])]
    return major > rMajor || (major === rMajor && minor > rMinor) ? [name] : []
  })
}
