/**
 * The two tokens hq signs for relays (adr-0153), as JWTs with its RS256 key (`HQ_JWKS_PATH`):
 *
 * - a **file ticket**, for one purpose, one file at one version, one person, through one relay: a file on one site,
 *   or (for an upload hq keeps) one served by hq's relay itself. It travels in the link a browser fetches (`RELAY_TICKET_PATH_PREFIX`), so a frame or a download can use it.
 * - a **relay pass**, which lets one site hold a line to one relay. hq gives it to the site with `relay.assign` and
 *   renews it before it ends.
 *
 * Also an **app ticket** and a **bundle ticket**, for a live preview's apps and for a
 * branch sent between two sites (appTickets.ts).
 *
 * Neither a site nor a relay can make any of them: only hq holds the private key. All are verified in one place,
 * `verifyRelayToken` (verifyToken.ts).
 */
import type { SiteFileRef, UploadFileRef } from '../files/refs.js'
import type {
  APP_TICKET_TOKEN_TYPE, AppTicketClaims, BUNDLE_TICKET_TOKEN_TYPE, BundleTicketClaims,
} from './appTickets.js'

export const FILE_TICKET_TOKEN_TYPE = 'file-ticket'
export const RELAY_PASS_TOKEN_TYPE = 'relay-pass'
export type RelayTokenType =
  | typeof FILE_TICKET_TOKEN_TYPE | typeof RELAY_PASS_TOKEN_TYPE | typeof APP_TICKET_TOKEN_TYPE | typeof BUNDLE_TICKET_TOKEN_TYPE

/** As the files address's signed links: long enough for a PDF viewer to read by range, short enough to leak little. */
export const FILE_TICKET_TTL_SECONDS = 5 * 60
export const RELAY_PASS_TTL_SECONDS = 60 * 60
/** hq sends a site a new pass once this much of the old one's life has passed. */
export const RELAY_PASS_RENEWAL_FRACTION = 0.8

/** The purposes a ticket may carry today. `preview` is drawn inline; `download` is sent as an attachment, with no cap. */
export const TICKET_PURPOSES = ['preview', 'download'] as const
export type TicketPurpose = (typeof TICKET_PURPOSES)[number]

/**
 * Purposes the relay protocol is shaped for but nothing accepts yet: a ticket naming one is refused as
 * `wrong-purpose` until a version of the protocol adds it to `TICKET_PURPOSES`.
 */
export const LATER_TICKET_PURPOSES = ['diff', 'ide-session'] as const
export type LaterTicketPurpose = (typeof LATER_TICKET_PURPOSES)[number]

export function isTicketPurpose(value: unknown): value is TicketPurpose {
  return typeof value === 'string' && (TICKET_PURPOSES as readonly string[]).includes(value)
}

/** The registered claims every hq token carries; times are seconds since the epoch, as JWT has them. */
export interface HqTokenRegisteredClaims {
  iss: string
  aud: string
  iat: number
  exp: number
  sub?: string
  /** A token's own id: random, at least 128 bits, so a party can take it once. App and bundle tickets carry one. */
  jti?: string
}

/** What every file ticket carries, whichever space its file is in. */
export interface FileTicketBase extends HqTokenRegisteredClaims {
  tokenType: typeof FILE_TICKET_TOKEN_TYPE
  purpose: TicketPurpose
  /** The file's version when the ticket was made (`fileVersion`): it is refused once the file changes. */
  version: string
  /** Who it was made for, for hq's audit row and the relay's streams-per-person cap. */
  person: string
  /** The relay it is served through: a site refuses a ticket arriving on a line to any other. */
  relay: string
}

/**
 * A ticket for a file on a site (a place's file, an artefact, a knowledge page). `aud` and `site` are both the
 * serving site's id, and must agree. The site confines the file to its owner's storage; the ticket only names it.
 */
export type SiteFileTicketClaims = FileTicketBase & SiteFileRef & {
  /** The site that serves the file. */
  site: string
}

/**
 * A ticket for a file hq keeps itself, served by hq's relay: `aud` and `relay` are both the relay's id. `person` is
 * null only for a picture the sign-in page shows (`mayBeShownBeforeSignIn`), opened before anyone signs in.
 */
export type UploadFileTicketClaims = Omit<FileTicketBase, 'person'> & UploadFileRef & { person: string | null }

/** A file ticket's claims: what it opens is named in one of four spaces (`FileRef`). */
export type FileTicketClaims = SiteFileTicketClaims | UploadFileTicketClaims

/** What hq fills in to sign a ticket: its claims without the registered ones, space by space. */
export type FileTicketInput = FileTicketClaims extends infer C
  ? C extends FileTicketClaims ? Omit<C, keyof HqTokenRegisteredClaims | 'tokenType'> : never
  : never

/** A relay pass's claims: `sub` the site, `aud` the relay. */
export interface RelayPassClaims extends HqTokenRegisteredClaims {
  tokenType: typeof RELAY_PASS_TOKEN_TYPE
  sub: string
}

export type RelayTokenClaims<T extends RelayTokenType> =
  T extends typeof FILE_TICKET_TOKEN_TYPE ? FileTicketClaims
    : T extends typeof APP_TICKET_TOKEN_TYPE ? AppTicketClaims
      : T extends typeof BUNDLE_TICKET_TOKEN_TYPE ? BundleTicketClaims
        : RelayPassClaims

/**
 * Why a token was refused. A refusal never carries the token, and a caller never logs one.
 * - `malformed`: not a compact JWT, or a claim missing or of the wrong shape;
 * - `forged`: an algorithm other than RS256, or a signature that does not verify;
 * - `unknown-key`: signed with a key id the key set does not hold — refetch hq's key set once, then refuse;
 * - `expired`: at or past its expiry, or claiming a longer life than its kind may have;
 * - `wrong-issuer`, `wrong-type`, `wrong-audience`: not hq's, not this kind of token, not for this party;
 * - `wrong-purpose`: a ticket for a purpose not accepted (yet, or here);
 * - `wrong-space`: a ticket for a file in a space this party does not serve (an upload at a site, a site's file at
 *   hq's relay);
 * - `wrong-relay`: a ticket that arrived on a line to a relay it does not name;
 * - `wrong-site`: a pass presented by a site it was not given to.
 * - `entry-closed`: an app ticket presented to enter at or after its `enterBy`.
 */
export type RelayTokenRefusal =
  | 'malformed' | 'forged' | 'unknown-key' | 'expired' | 'wrong-issuer' | 'wrong-type' | 'wrong-audience'
  | 'wrong-purpose' | 'wrong-space' | 'wrong-relay' | 'wrong-site' | 'entry-closed'

export type RelayTokenVerdict<C> =
  | { ok: true; claims: C }
  | { ok: false; refusal: RelayTokenRefusal; detail: string }
