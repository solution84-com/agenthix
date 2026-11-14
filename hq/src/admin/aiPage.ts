/**
 * Where things are on the AI page (Manage organisation › AI): its address and the anchors of its sections and lines. A
 * link to any part of the page is the page with that part's anchor, so alerts, notices and the old addresses all open
 * it the same way.
 */
export const AI_PAGE = '/admin/ai'

export const AI_ANCHORS = {
  providers: 'providers',
  capabilities: 'what-agents-can-do',
  webSearch: 'web-search',
  models: 'which-models-may-run',
} as const

/** The element id of one provider's line, which a link to it scrolls to and marks. */
export const providerAnchor = (id: string) => `provider-${id}`

export const aiPageUrl = (anchor: string) => `${AI_PAGE}#${anchor}`

export const PROVIDERS_URL = aiPageUrl(AI_ANCHORS.providers)

export const providerLineUrl = (id: string) => aiPageUrl(providerAnchor(encodeURIComponent(id)))

const MOVED: Record<string, string> = {
  '/admin/providers': AI_ANCHORS.providers,
  '/admin/models': AI_ANCHORS.models,
  '/admin/settings/model-access': AI_ANCHORS.webSearch,
}

/**
 * Where a page that became part of the AI page now is, or null for an address that did not move. A link to one
 * provider (`/admin/providers?provider=<id>`) opens that provider's line.
 */
export function aiPathFor(pathname: string, search = ''): string | null {
  const anchor = MOVED[pathname.replace(/\/+$/, '')]
  if (!anchor) return null
  const provider = new URLSearchParams(search).get('provider')
  return provider ? providerLineUrl(provider) : aiPageUrl(anchor)
}
