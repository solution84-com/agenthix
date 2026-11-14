/**
 * Which images a version of HQ and its site runs. A part published from some version on is no part of a version
 * before it, which has no image of it in the registry: such a version is run, checked, fetched and put back without
 * it, as the host service of its own day ran it. Decided from the version alone, with no network, so going back to
 * an older version needs no registry.
 *
 * A development build's version (`dev`) has every part: it runs whatever was built on the machine.
 */
import { isPublishedVersion, type PublishedPart } from './published'
import { compare } from '../upgrades/versions'

/** The first published version of each part that has not been in every one. */
export const FIRST_PUBLISHED: Partial<Record<PublishedPart, string>> = {
  relay: '0.1.0-alpha.4',
  executor: '0.1.0-alpha.4',
}

/** Whether `version` has an image of `part`. */
export function hasPart(part: PublishedPart, version: string): boolean {
  const first = FIRST_PUBLISHED[part]
  return !first || !isPublishedVersion(version) || compare(version, first) >= 0
}

/** Of `parts`, the ones `version` has. */
export const partsOf = <P extends PublishedPart>(parts: readonly P[], version: string): P[] => parts.filter(p => hasPart(p, version))

/** HQ's images, without its site's. */
export const HQ_PARTS = ['hq-server', 'hq-web', 'relay'] as const satisfies readonly PublishedPart[]

/** The services of HQ's compose project at `version`: hq-db, hq-server, the relay where it has one, hq-web. */
export const hqServicesOf = (version: string): string[] => ['hq-db', 'hq-server', ...(hasPart('relay', version) ? ['relay'] : []), 'hq-web']
