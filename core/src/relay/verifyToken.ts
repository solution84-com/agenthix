/**
 * The one place a file ticket or a relay pass is verified (adr-0153): by the site before it reads a byte, and by the
 * relay before it keeps a site's line. The signature is checked before any claim, so a forgery learns nothing about
 * which claim it got wrong; then every claim the token's kind carries, its shape included.
 */
import { HQ_TOKEN_ISSUER } from '../protocol/capability.js'
import { readFileRef, SITE_FILE_SPACES, type FileSpace } from '../files/refs.js'
import { mayBeShownBeforeSignIn } from '../files/uploadPaths.js'
import { isRs256Key, parseCompactJwt, rs256Verifies, type JsonWebKeySet } from './rs256.js'
import { APP_TICKET_TOKEN_TYPE, APP_TICKET_TTL_SECONDS, BUNDLE_TICKET_TOKEN_TYPE, BUNDLE_TICKET_TTL_SECONDS } from './appTickets.js'
import { readAppTicket, readBundleTicket, type AppTicketExpectation, type BundleTicketExpectation } from './verifyAppTicket.js'
import {
  FILE_TICKET_TOKEN_TYPE, FILE_TICKET_TTL_SECONDS, RELAY_PASS_TOKEN_TYPE, RELAY_PASS_TTL_SECONDS, TICKET_PURPOSES,
  type RelayTokenClaims, type RelayTokenRefusal, type RelayTokenType, type RelayTokenVerdict, type TicketPurpose,
} from './tokens.js'

type Common = {
  /** hq's key set, as the caller last fetched it from `HQ_JWKS_PATH`. */
  keys: JsonWebKeySet
  /**
   * Who the token must be for: the site's id for a file or app ticket, the relay's id for a pass. For a bundle ticket,
   * the reading site's id, which must be the end it names.
   */
  audience: string
  /** The time now, in milliseconds since the epoch. */
  nowMs: number
  /** Defaults to hq's issuer. */
  issuer?: string
}

export type RelayTokenExpectation =
  | (Common & {
    type: typeof FILE_TICKET_TOKEN_TYPE
    /** The relay whose line the ticket arrived on. Always given by a site serving a stream. */
    relay?: string
    /** Narrower than every accepted purpose, where a caller serves only some. */
    purposes?: readonly TicketPurpose[]
    /**
     * The spaces this party serves files from. A site leaves it out and serves its own three (`SITE_FILE_SPACES`);
     * hq's relay names `['upload']`, with its own id as the audience.
     */
    spaces?: readonly FileSpace[]
  })
  | (Common & {
    type: typeof RELAY_PASS_TOKEN_TYPE
    /** The site id the dialling site presented. Always given by a relay accepting a line. */
    site?: string
  })
  | (Common & AppTicketExpectation & { type: typeof APP_TICKET_TOKEN_TYPE })
  | (Common & BundleTicketExpectation & { type: typeof BUNDLE_TICKET_TOKEN_TYPE })

const MAX_LIFE: Record<RelayTokenType, number> = {
  [FILE_TICKET_TOKEN_TYPE]: FILE_TICKET_TTL_SECONDS,
  [RELAY_PASS_TOKEN_TYPE]: RELAY_PASS_TTL_SECONDS,
  [APP_TICKET_TOKEN_TYPE]: APP_TICKET_TTL_SECONDS,
  [BUNDLE_TICKET_TOKEN_TYPE]: BUNDLE_TICKET_TTL_SECONDS,
}

const refuse = (refusal: RelayTokenRefusal, detail: string) => ({ ok: false as const, refusal, detail })
const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0')

export async function verifyRelayToken<E extends RelayTokenExpectation>(
  token: string,
  expect: E,
): Promise<RelayTokenVerdict<RelayTokenClaims<E['type']>>> {
  const jwt = parseCompactJwt(token)
  if (!jwt) return refuse('malformed', 'not a compact JWT')
  const { header, payload: c } = jwt
  if (header.alg !== 'RS256') return refuse('forged', 'not signed with RS256')
  if ('crit' in header) return refuse('forged', 'carries critical header extensions')
  if (typeof header.kid !== 'string') return refuse('malformed', 'names no key id')
  const key = expect.keys.keys.find(k => k.kid === header.kid)
  if (!key) return refuse('unknown-key', 'signed with a key not in hq\'s key set')
  if (!isRs256Key(key)) return refuse('forged', 'its key is not an RS256 signing key')
  if (!(await rs256Verifies(key, jwt))) return refuse('forged', 'the signature does not verify')

  if (c.iss !== (expect.issuer ?? HQ_TOKEN_ISSUER)) return refuse('wrong-issuer', 'not issued by hq')
  if (c.tokenType !== expect.type) return refuse('wrong-type', `not a ${expect.type}`)
  if (!Number.isInteger(c.iat) || !Number.isInteger(c.exp)) return refuse('malformed', 'no issue or expiry time')
  const iat = c.iat as number
  const exp = c.exp as number
  if (exp <= iat || exp - iat > MAX_LIFE[expect.type]) return refuse('expired', 'claims a longer life than its kind may have')
  if (Math.floor(expect.nowMs / 1000) >= exp) return refuse('expired', 'past its expiry')
  if (c.sub !== undefined && !text(c.sub)) return refuse('malformed', 'a subject that is not an id')

  if (expect.type === APP_TICKET_TOKEN_TYPE || expect.type === BUNDLE_TICKET_TOKEN_TYPE) {
    if (typeof c.aud !== 'string') return refuse('malformed', 'no audience')
    const base = { iss: c.iss as string, aud: c.aud, iat, exp }
    const read = expect.type === APP_TICKET_TOKEN_TYPE
      ? readAppTicket(c, base, expect.audience, expect, Math.floor(expect.nowMs / 1000))
      : readBundleTicket(c, base, expect.audience, expect)
    if ('refusal' in read) return refuse(read.refusal, read.detail)
    return { ok: true, claims: read.claims as unknown as RelayTokenClaims<E['type']> }
  }
  if (c.aud !== expect.audience) return refuse('wrong-audience', 'made for another party')

  if (expect.type === RELAY_PASS_TOKEN_TYPE) {
    if (!text(c.sub)) return refuse('malformed', 'names no site')
    if (expect.site !== undefined && c.sub !== expect.site) return refuse('wrong-site', 'given to another site')
  } else {
    const accepted: readonly string[] = expect.purposes ?? TICKET_PURPOSES
    if (typeof c.purpose !== 'string' || !(TICKET_PURPOSES as readonly string[]).includes(c.purpose)
      || !accepted.includes(c.purpose)) return refuse('wrong-purpose', 'for a purpose not accepted here')
    const file = readFileRef(c)
    if (!file) return refuse('malformed', 'names no file in a space it may be in')
    if (!(expect.spaces ?? SITE_FILE_SPACES).includes(file.space)) return refuse('wrong-space', 'for a file served elsewhere')
    if (!text(c.version) || !text(c.relay)) return refuse('malformed', 'a field is missing')
    // Only a picture the sign-in page shows may be opened by nobody in particular.
    const personless = c.person === null && file.space === 'upload' && mayBeShownBeforeSignIn(file.path)
    if (!personless && !text(c.person)) return refuse('malformed', 'names no person')
    if (file.space === 'upload') {
      // Served by hq's relay itself: it names no site, and no field of a site's file to be mistaken for one.
      if (['site', 'loc', 'owner', 'name'].some(k => k in c)) return refuse('malformed', 'an upload names a site\'s file')
      if (c.relay !== c.aud) return refuse('malformed', 'its relay and audience disagree')
    } else if (c.site !== c.aud) return refuse('malformed', 'its site and audience disagree')
    if (expect.relay !== undefined && c.relay !== expect.relay) return refuse('wrong-relay', 'made for another relay')
    // Only the fields a ticket has, its file's as `readFileRef` read them: nothing else in the payload goes further.
    const claims = {
      iss: c.iss, aud: c.aud, iat, exp, ...(c.sub === undefined ? {} : { sub: c.sub }),
      tokenType: c.tokenType, purpose: c.purpose, version: c.version, person: c.person, relay: c.relay,
      ...file, ...(file.space === 'upload' ? {} : { site: c.site }),
    }
    return { ok: true, claims: claims as unknown as RelayTokenClaims<E['type']> }
  }
  return { ok: true, claims: c as unknown as RelayTokenClaims<E['type']> }
}

/** Where a ticket says it goes: down a site's line, or (an upload) to the relay itself. */
export type TicketRoute =
  | { servedBy: 'site'; site: string; person: string }
  /** `person` null: a picture shown before sign-in, whose streams the relay counts together. */
  | { servedBy: 'relay'; person: string | null }

/**
 * Where a ticket says it goes, read WITHOUT verifying it: the relay's use of a ticket to choose the site's line and
 * count streams per person. The site verifies everything; for an upload, the relay verifies it itself, as the
 * audience. Null when it is not a ticket's shape.
 */
export function readTicketRoute(token: string): TicketRoute | null {
  const jwt = parseCompactJwt(token)
  if (!jwt) return null
  const { space, site, person } = jwt.payload
  if (space === 'upload' && (person === null || text(person))) return { servedBy: 'relay', person }
  if (!text(person)) return null
  return typeof space === 'string' && (SITE_FILE_SPACES as readonly string[]).includes(space) && text(site)
    ? { servedBy: 'site', site, person }
    : null
}

/**
 * Which site an app ticket says it is for, read WITHOUT verifying it: the relay's first look at an entry, to verify it
 * with that site as the audience and its own id as the relay. Null when it is not an app ticket's shape.
 */
export function readAppTicketSite(token: string): string | null {
  const jwt = parseCompactJwt(token)
  if (!jwt || jwt.payload.tokenType !== APP_TICKET_TOKEN_TYPE) return null
  return text(jwt.payload.site) ? jwt.payload.site : null
}
