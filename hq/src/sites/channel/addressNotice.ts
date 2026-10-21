/**
 * hq telling its connected sites the address it moves to (host-management spec §13; core's `hqAddress.ts`), over the
 * channel each already has, before it stops. Each site checks the new address itself and switches only once it
 * passes. The default site is not told: it reaches hq over the private Docker network on hq's machine, and the host
 * service sets its address.
 */
import { SITE_HQ_ADDRESS_METHOD, type SiteHqAddressParams, type SiteHqAddressResult } from '@agenthix/core'
import type { SiteChannelRegistry } from './siteChannelRegistry'

const TOLD_WITHIN_MS = 10_000

export type SitesTold = { told: number; online: number }

export async function tellSitesNewAddress(registry: SiteChannelRegistry, address: string, skipSiteId: string | null): Promise<SitesTold> {
  const ids = registry.onlineSiteIds.filter(id => id !== skipSiteId)
  const params: SiteHqAddressParams = { address }
  const answers = await Promise.all(ids.map(async id => {
    try {
      const result = await registry.request(id, SITE_HQ_ADDRESS_METHOD, params, TOLD_WITHIN_MS)
      return result?.taken === true
    } catch {
      return false
    }
  }))
  return { told: answers.filter(Boolean).length, online: ids.length }
}
