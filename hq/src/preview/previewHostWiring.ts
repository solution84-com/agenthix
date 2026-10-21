import type { Server } from 'node:http'
import { trustedProxyCount } from '../server/trustedProxies'
import { canAccess } from './previewAuth'
import { previewCookieKey } from './previewCookie'
import { attachPreviewHost, createPreviewHost } from './previewHost'
import { agentFor } from './previewProxy'
import { getById, markStatus, touch } from './previewRegistry'
import { previewTickets } from './previewTicket'
import { hqClientUrl, previewDomain } from './previewWiring'

/** hq's own preview host, on hq's own http server. Returns the domain it serves, or null when off. */
export function registerPreviewHost(server: Server): string | null {
  const domain = previewDomain()
  const key = previewCookieKey()
  const host = createPreviewHost({
    domain: () => domain,
    hqClientUrl,
    cookieKey: () => key,
    tickets: previewTickets,
    trustProxy: trustedProxyCount(),
    getById,
    canAccess,
    touch,
    markStatus,
    agentFor,
  })
  attachPreviewHost(server, host, () => domain)
  return domain
}
