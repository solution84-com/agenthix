/**
 * What the site sends when it dials hq, and how it reads hq's refusals: shared by the control channel
 * (hqConnection.ts) and the content transport (content/contentConnection.ts), which dial with the same headers
 * and are refused for the same reasons.
 */
import {
  HQ_SITE_REPLACED_HEADER,
  HQ_SITE_UNKNOWN_HEADER,
  SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER,
  peerRefusalMessage,
} from '@agenthix/core'

type Headers = Record<string, string | string[] | undefined>

const first = (raw: string | string[] | undefined): string | undefined => (Array.isArray(raw) ? raw[0] : raw)

export function siteDialHeaders(token: string, siteId: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'X-Site-Id': siteId, [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION }
}

/** The site protocol version hq stated with a 426; undefined when it stated none. */
export function statedHqVersion(headers: Headers): string | undefined {
  return first(headers[SITE_PROTOCOL_VERSION_HEADER.toLowerCase()])
}

/** A 426 in words: the compatibility rule applied to hq's version, naming the side that must upgrade. */
export const hqRefusalMessage = (stated: string | undefined): string =>
  peerRefusalMessage(SITE_PROTOCOL_VERSION, stated, { own: 'this site', peer: 'HQ' })

/** A 401 that says hq has no record of this site at all. */
export function isUnknownSite(status: number, headers: Headers): boolean {
  return status === 401 && headers[HQ_SITE_UNKNOWN_HEADER.toLowerCase()] !== undefined
}

/** When hq says a restore onto another machine replaced this copy (adr-0119); null for any other answer. */
export function replacedAtOf(headers: Headers): Date | null {
  const value = first(headers[HQ_SITE_REPLACED_HEADER.toLowerCase()])
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

export const SITE_UNKNOWN_MESSAGE = 'hq does not recognise this site — a fleet admin adds it again in the Fleet Console'

export const replacedMessage = (at: Date): string =>
  `hq refuses this copy of the site: it was restored onto another machine on ${at.toISOString()}, which runs it now`
