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
 */
type Link = { url: string; expiresAt: string }

const REFRESH_BEFORE_MS = 60_000
const cache = new Map<string, Promise<string | null>>()

export function fileLink(rawUrl: string, download = false): Promise<Link> {
  const searchParams: Record<string, string> = { path: rawUrl }
  if (download) searchParams.download = '1'
  return api.get('file-link', { searchParams }).json<Link>()
}

export function resolveAgentImageUrl(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return Promise.resolve(null)

  const cached = cache.get(rawUrl)
  if (cached) return cached

  const promise = fileLink(rawUrl)
    .then((link) => {
      const left = new Date(link.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_MS
      setTimeout(() => {
        if (cache.get(rawUrl) === promise) cache.delete(rawUrl)
      }, Math.max(left, 0))
      return link.url
    })
    .catch(() => {
      cache.delete(rawUrl)
      return null
    })
  cache.set(rawUrl, promise)
  return promise
}
