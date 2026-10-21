import type { Server as HttpServer } from 'node:http'
import { authenticateSite, siteExists } from '../registrationService'
import { replacedSiteAt } from '../../fleet/replacedSite'
import { prismaSiteStatusStore } from '../channel/siteStatusStore'
import { ContentChannelRegistry } from './contentChannelRegistry'
import { attachContentChannel } from './contentChannelServer'
import type { ContentStream } from './contentStream'

/**
 * The one content registry. Three production methods open their streams
 * through `openContentStream`:
 *
 *  - `packages.put` (../../../packages/packageDelivery.ts);
 *  - `location.readFile` (../../../storage/locationFileStore.ts), which is how
 *    every byte of a location's files crosses — there is no size threshold
 *    sending a small file the other way; and
 *  - `preview.connect` (../../../preview/previewRelay.ts), a running preview's
 *    own traffic in both directions, opened once per browser connection.
 */
export const contentChannelRegistry = new ContentChannelRegistry()

export function startContentChannel(server: HttpServer): void {
  attachContentChannel(server, {
    registry: contentChannelRegistry,
    authenticate: (siteId, credential) => authenticateSite(siteId, credential),
    siteExists,
    replacedAt: replacedSiteAt,
    recordProtocolVersion: (siteId, version) => prismaSiteStatusStore.recordProtocolVersion(siteId, version),
    markVersionMismatch: (siteId, version, attemptedAt) => prismaSiteStatusStore.markVersionMismatch(siteId, version, attemptedAt),
  })
}

export function openContentStream(siteId: string, method: string, params: unknown): Promise<ContentStream> {
  return contentChannelRegistry.open(siteId, method, params)
}

export { ContentStream, ContentStreamFailed } from './contentStream'
