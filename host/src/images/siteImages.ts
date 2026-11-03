/** The images a site runs, together: its server, the agents' image and the workflow executor. Every path that
 * checks, fetches or pins a site's images goes through these, so none leaves one out. */
import type { ImagePins, WantedImage } from './images'
import type { PublishedPart } from './published'

export const SITE_PARTS = ['site-server', 'agent', 'executor'] as const satisfies readonly PublishedPart[]

export const siteImagesWanted = (version: string): WantedImage[] => SITE_PARTS.map(part => ({ part, version }))

/** What a stored site keeps of the checked pins. */
export const sitePins = (pins: ImagePins): ImagePins => ({ 'site-server': pins['site-server'], agent: pins.agent, executor: pins.executor })

/** The references to fetch for a site. */
export const siteRefs = (pins: ImagePins): string[] => SITE_PARTS.map(part => pins[part]!)
