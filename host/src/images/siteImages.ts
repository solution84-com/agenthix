/** The images a site runs, together: its server, the agents' image and the workflow executor (from the version that
 * has one, `partsOfVersion.ts`). Every path that checks, fetches or pins a site's images goes through these, so none
 * leaves one out. */
import type { ImagePins, WantedImage } from './images'
import type { PublishedPart } from './published'
import { partsOf } from './partsOfVersion'

export const SITE_PARTS = ['site-server', 'agent', 'executor'] as const satisfies readonly PublishedPart[]

export const siteImagesWanted = (version: string): WantedImage[] => partsOf(SITE_PARTS, version).map(part => ({ part, version }))

/** What a stored site keeps of the checked pins: the site's own, and only those that were checked. */
export const sitePins = (pins: ImagePins): ImagePins => pinsOf(SITE_PARTS, pins)

/** The references to fetch for a site of `version`. */
export const siteRefs = (pins: ImagePins, version: string): string[] => refsOf(SITE_PARTS, pins, version)

export function pinsOf(parts: readonly PublishedPart[], pins: ImagePins): ImagePins {
  return Object.fromEntries(parts.filter(p => pins[p]).map(p => [p, pins[p]]))
}

/** Each part of `version`'s pin, which its check gave; a missing one is a mistake in the caller, never skipped. */
export function refsOf(parts: readonly PublishedPart[], pins: ImagePins, version: string): string[] {
  return partsOf(parts, version).map(part => {
    const ref = pins[part]
    if (!ref) throw new Error(`The image of ${part} ${version} was not checked, so it is not fetched.`)
    return ref
  })
}
