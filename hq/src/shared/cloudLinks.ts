/**
 * Links from hq to Agenthix Cloud, and the offers hq can make of it. A link carries a path on Cloud and only these:
 * where the person came from on hq (`return`, a path and never hq's address), what they were doing (`task`) and the
 * entry point (`from`). Nothing names the organisation or the person; Cloud sends them back by the browser's history.
 * Client-safe: Cloud's origin is handed in by the server.
 */

/** The offers to fleet admins that hq's own screens carry; the Fleet Console keeps the other two on its pages. */
export const CLOUD_OFFERS = ['site', 'backups', 'address'] as const
export type CloudOffer = typeof CLOUD_OFFERS[number]

export const CLOUD_PATHS = {
  /** The person's own switcher on Cloud. */
  switch: '/organisations',
  /** Starting an organisation of one's own. */
  start: '/organisations/new',
  /** What Cloud is, and running sites on it. */
  sites: '/sites',
} as const

export type CloudLinkOptions = { from: string; task?: string; returnPath?: string }

/** The address on Cloud, or null when hq does not know where Cloud is. `returnPath` that is not a path on hq is left out. */
export function cloudLinkOut(origin: string | null, path: string, { from, task, returnPath }: CloudLinkOptions): string | null {
  if (!origin) return null
  const url = new URL(path, origin)
  url.searchParams.set('from', from)
  if (task) url.searchParams.set('task', task)
  if (returnPath && /^\/(?!\/)[^?#\s]*$/.test(returnPath)) url.searchParams.set('return', returnPath)
  return url.toString()
}
