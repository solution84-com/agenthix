import { BUILT_IN_PUBLISHER } from './packageManifest'

/** What a built-in library item records of itself when hq seeds it from its assets. */
export function builtIn(version: number) {
  return { source: 'BUILT_IN' as const, publisher: BUILT_IN_PUBLISHER, packageVersion: String(version) }
}
