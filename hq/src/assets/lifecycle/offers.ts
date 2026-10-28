/** What is offered after *Skip this version* and dismissed news (board U5): a later version undoes either. Pure. */
import { compareSemVer } from '@agenthix/core'

/** Whether a version is past the one skipped or seen up to: nothing skipped, or a later one. */
export const pastMark = (version: string, upTo: string | null): boolean => !upTo || compareSemVer(version, upTo) > 0

/** The update offered: the newest version not withdrawn that is newer than the one in use and past any skipped. */
export function offeredUpdate<V extends { version: string; withdrawn: boolean }>(versions: V[], inUse: string, skipped: string | null): V | null {
  return versions
    .filter(v => !v.withdrawn && compareSemVer(v.version, inUse) > 0 && pastMark(v.version, skipped))
    .sort((a, b) => compareSemVer(b.version, a.version))[0] ?? null
}
