/**
 * A site's name as people read it, in the client and on the server. Every site
 * is named after its machine; HQ's own is tagged, "hq-box · HQ's site", so it
 * is not read as HQ itself.
 */
export const HQ_SITE_TAG = "HQ's site"

export function displaySiteName(site: { label: string; isDefault: boolean }): string {
  return site.isDefault ? `${site.label} · ${HQ_SITE_TAG}` : site.label
}

/** hq's relay is named after its machine too, and tagged as its site is: "hq-box · HQ's relay". */
export const HQ_RELAY_TAG = "HQ's relay"

export function displayRelayName(relay: { name: string; isHq: boolean }): string {
  return relay.isHq ? `${relay.name} · ${HQ_RELAY_TAG}` : relay.name
}

/** A site row with its label as shown, and `isDefault` left behind: for a query that hands a site to the client. */
export function siteAsShown<T extends { label: string; isDefault: boolean }>(site: T | null): (Omit<T, 'isDefault'> & { label: string }) | null {
  if (!site) return null
  const { isDefault, ...rest } = site
  return { ...rest, label: displaySiteName({ label: site.label, isDefault }) }
}
