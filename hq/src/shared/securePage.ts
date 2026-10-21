/**
 * The microphone, which a browser gives only to a secure page: https, or hq opened on its own machine at
 * localhost. hq is also opened over plain http at a network address, where `navigator.mediaDevices` is missing and
 * nothing can stand in for it, so voice and dictation say so in words instead of failing on a missing object.
 */
export const SECURE_PAGE_WORDS =
  'Voice and dictation need a secure page: open HQ over https, or on this computer at localhost.'

/** The error a refused microphone carries when the page is not secure; `name` tells it from the browser's own. */
export class SecurePageNeeded extends Error {
  constructor() {
    super(SECURE_PAGE_WORDS)
    this.name = 'SecurePageNeeded'
  }
}

/** The browser's media devices, or null on a page that is not secure. */
export function mediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null
  // The DOM's types say it is always there; on a page that is not secure it is not.
  const media = (navigator as { mediaDevices?: MediaDevices }).mediaDevices
  return typeof media?.getUserMedia === 'function' ? media : null
}

/** Whether this page may open the microphone at all. */
export function microphonePossible(): boolean {
  return mediaDevices() !== null
}

/** Opens the microphone, or throws `SecurePageNeeded` where the page cannot have one. */
export function getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const media = mediaDevices()
  if (!media) return Promise.reject(new SecurePageNeeded())
  return media.getUserMedia(constraints)
}
