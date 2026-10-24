/**
 * A development build's switch to an image built on the machine (spec Rule 1): no signature and no "only forward",
 * since neither has a version. What it must still hold, checked by the host service before it writes the switch
 * down and by the launcher again before it takes it up: it is not a published image — that one is switched to only
 * by a published host service, against its signature — and it is not the image already running.
 */
import type { ImageInfo } from '../docker/containers'
import { fromTrustedPublisher } from '../images/published'

/** Why `ref` (held by Docker as `image`) is no image a development build switches to; null when it is one. */
export function builtRefusal(ref: string, image: ImageInfo, running: string | null): string | null {
  if (fromTrustedPublisher(ref) || image.repoDigests.some(d => fromTrustedPublisher(d))) {
    return `${ref} is a published image. A development build switches only to an image built on this machine; a published one is run by starting the host service from it, which checks its signature.`
  }
  if (image.id === running) return `The host service already runs ${ref}.`
  return null
}
