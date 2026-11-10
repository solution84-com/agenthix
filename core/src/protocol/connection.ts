/**
 * The site protocol: what hq and an Execution Site speak on the control and content channels, as `major.minor`.
 *
 * 1.0 is the baseline every later version counts from. Bump the **minor** for an addition (a new message, method,
 * event or optional field) and the **major** for a break (something removed, renamed or given a new meaning, or a
 * new required field). Whether two ends work together is `checkProtocolCompatibility` (compatibility.ts): majors at
 * most one apart, the newer side speaking the older side's major.
 */
export const SITE_PROTOCOL_VERSION = '1.18'

/**
 * How long a site waits without hearing anything from hq before it treats the
 * connection as dead and reconnects. hq pings every 30 s on both connections, so
 * this tolerates one lost ping and part of a second; a silently dropped path (a
 * laptop that slept, NAT state that expired) otherwise leaves the site's socket
 * open forever while hq has already given up on it.
 */
export const SITE_SILENCE_TIMEOUT_MS = 75_000

export interface ProtocolVersion {
  major: number
  minor: number
}

export function parseProtocolVersion(raw: string): ProtocolVersion | null {
  const match = /^(\d+)\.(\d+)$/.exec((raw ?? '').trim())
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

/**
 * The path hq listens on for a site's outbound control channel. Path-scoped
 * because socket.io owns the same http server: the upgrade handler matches
 * this exactly and hands everything else back untouched.
 */
export const HQ_SITE_CHANNEL_PATH = '/hq-link'

/**
 * The site protocol's header. A site states its `SITE_PROTOCOL_VERSION` in it when it dials either channel, and hq
 * states its own in it on a 426, so the site applies the same rule from its side and says which of the two must
 * upgrade, rather than reporting a connection failure it cannot explain.
 */
export const SITE_PROTOCOL_VERSION_HEADER = 'X-Site-Protocol-Version'

/**
 * Sent with a 401 when hq has no record of the site id at all — the one
 * refusal that says which of the reasons it was, so a site whose registration
 * is gone (hq's database was reset) can tell the operator to register again
 * instead of retrying forever. A wrong credential for a known id, and a
 * revoked site, carry no such header.
 */
export const HQ_SITE_UNKNOWN_HEADER = 'X-HQ-Site-Unknown'
export const HQ_SITE_UNKNOWN_VALUE = '1'

/**
 * Sent with a 401 when the credential presented is one a restore of the site onto another machine replaced
 * (adr-0119): the old machine's copy of the site. Its value is when the restore was, as an ISO time. Sent only to a
 * caller that presents that very credential for that site, so it tells no one anything about another site. The site
 * stops trying: no retry can succeed.
 */
export const HQ_SITE_REPLACED_HEADER = 'X-HQ-Site-Replaced'
