import { api } from 'wasp/client/api'

/**
 * Turns a stored picture path (an agent's avatar or cover, a person's, the
 * organisation's or a team's) into an address an `<img>` can load.
 *
 * Uploaded files are served by HQ's relay (adr-0153), each on a short-lived
 * ticket HQ signs for one file and one person: an `<img src>` cannot carry the
 * session's token, and the relay never sees it. So the link is asked for once
 * through the authenticated client, and the same one handed
 * to every caller that asks for the same path while it lives — a session's
 * sidebar row and its open chat panel can show the same agent at once.
 *
 * An entry is dropped a minute before its link expires, so the next caller
 * gets a fresh one; an image already on screen stays, since the browser has it.
 * A failure is not cached: the next mount tries again.
 *
 * `small` (the default) asks for the picture's small copy, which hq links when there is one and falls back to the
 * picture itself when there is not: lists, cards, the thread and notifications. `full` is for a picture shown large —
 * a header's cover, the inspect view. A link is cached per path and size.
 */
type Link = { url: string; expiresAt: string }

export type PictureSize = 'small' | 'full'

const REFRESH_BEFORE_MS = 60_000
const cache = new Map<string, Promise<string | null>>()

export function fileLink(rawUrl: string, download = false, size: PictureSize = 'full'): Promise<Link> {
  const searchParams: Record<string, string> = { path: rawUrl }
  if (download) searchParams.download = '1'
  if (size === 'small') searchParams.size = 'small'
  return api.get('file-link', { searchParams }).json<Link>()
}

export function resolveAgentImageUrl(rawUrl: string | null | undefined, size: PictureSize = 'small'): Promise<string | null> {
  if (!rawUrl) return Promise.resolve(null)

  const key = `${size} ${rawUrl}`
  const cached = cache.get(key)
  if (cached) return cached

  const promise = fileLink(rawUrl, false, size)
    .then((link) => {
      const left = new Date(link.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_MS
      setTimeout(() => {
        if (cache.get(key) === promise) cache.delete(key)
      }, Math.max(left, 0))
      return link.url
    })
    .catch(() => {
      cache.delete(key)
      return null
    })
  cache.set(key, promise)
  return promise
}
