import { resolveChannelUrl } from '../hq/resolveChannelUrl'

const MAX_LINE_URL_LENGTH = 2048
const WS_FOR: Record<string, string> = { 'ws:': 'ws:', 'wss:': 'wss:', 'http:': 'ws:', 'https:': 'wss:' }

/**
 * Where to dial a relay's line, from `relay.assign`'s `lineUrl`: an absolute address, or a path resolved against the
 * address this site dials hq's control channel on — so hq's own relay is reached through the same front door as hq.
 * Null for anything that is not a WebSocket or HTTP address, or that carries credentials: the site dials only an
 * address hq gave, and only with the pass as its credential.
 */
export function resolveLineUrl(lineUrl: string, hqWsUrl: string): string | null {
  if (lineUrl.length === 0 || lineUrl.length > MAX_LINE_URL_LENGTH) return null
  const control = resolveChannelUrl(hqWsUrl)
  if (!control) return null
  let url: URL
  try {
    url = new URL(lineUrl, control)
  } catch {
    return null
  }
  const protocol = WS_FOR[url.protocol]
  if (!protocol || url.username || url.password || !url.hostname) return null
  url.protocol = protocol
  url.hash = ''
  return url.toString()
}
