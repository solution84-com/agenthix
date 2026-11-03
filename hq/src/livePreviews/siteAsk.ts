/**
 * hq's requests to a site for live previews (site protocol 1.12). A site that is not connected, or does not answer in
 * time, is a `SiteSilent`; an error frame is a `SiteFailed`; a site's coded refusal comes back in its answer (`ok: false`) for the caller to word.
 */
import type { SiteMethodName, SiteMethodParams, SiteMethodResult } from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'

/** Opening may install and start a container; the rest are quick. */
export const OPEN_TIMEOUT_MS = 120_000
export const ASK_TIMEOUT_MS = 30_000

export class SiteSilent extends Error {
  constructor(readonly siteId: string, readonly maybeReceived: boolean) {
    super(`site ${siteId} did not answer`)
    this.name = 'SiteSilent'
  }
}

/** The site answered with an error of its own (an old site's `unknown_method`, a fault): it did nothing it reported. */
export class SiteFailed extends Error {
  constructor(readonly siteId: string, readonly code: string) {
    super(`site ${siteId} answered ${code}`)
    this.name = 'SiteFailed'
  }
}

const SILENT = new Set(['offline', 'timeout', 'disconnected'])

export async function askSite<M extends SiteMethodName>(
  siteId: string, method: M, params: SiteMethodParams<M>, timeoutMs = ASK_TIMEOUT_MS,
): Promise<SiteMethodResult<M>> {
  try {
    return await siteChannelRegistry.request(siteId, method, params, timeoutMs)
  } catch (err) {
    if (err instanceof ChannelRequestFailed) {
      if (SILENT.has(err.code)) throw new SiteSilent(siteId, err.code !== 'offline')
      throw new SiteFailed(siteId, err.code)
    }
    throw err
  }
}
