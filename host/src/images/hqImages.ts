/** HQ's own images (hq-server, hq-web and, from the version that has one, the relay), checked, fetched and pinned
 * together, as `siteImages.ts` does a site's. */
import type { ImagePins, WantedImage } from './images'
import { HQ_PARTS, partsOf } from './partsOfVersion'
import { pinsOf, refsOf } from './siteImages'

export const hqImagesWanted = (version: string): WantedImage[] => partsOf(HQ_PARTS, version).map(part => ({ part, version }))

/** What a stored HQ keeps of the checked pins. */
export const hqPins = (pins: ImagePins): ImagePins => pinsOf(HQ_PARTS, pins)

export const hqRefs = (pins: ImagePins, version: string): string[] => refsOf(HQ_PARTS, pins, version)
