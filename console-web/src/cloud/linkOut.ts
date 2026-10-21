/**
 * A link from the Fleet Console to Agenthix Cloud (spec part D, ADR-0130): the page to come back to, what the person
 * was doing and where they started, and nothing else. Never the organisation, the person, a count, or this machine's
 * address: `return` is a path only, and Cloud sends the person back through the browser's own history.
 */
export type CloudTask = 'connect' | 'switch' | 'start-organisation' | 'link-account' | 'offer-site' | 'offer-backups' | 'offer-address' | 'open'

export type CloudEntry =
  | 'fleet-console-menu' | 'fleet-console-hq' | 'fleet-console-backups' | 'fleet-console-address' | 'fleet-console-dashboard'

/** The address of Cloud's start page with these three parameters; null where Cloud's address is not known. */
export function cloudLinkOut(cloudUrl: string | null | undefined, link: { task: CloudTask; from: CloudEntry }, path = window.location.pathname): string | null {
  if (!cloudUrl) return null
  const url = new URL('/start', cloudUrl)
  url.searchParams.set('return', path)
  url.searchParams.set('task', link.task)
  url.searchParams.set('from', link.from)
  return url.toString()
}
