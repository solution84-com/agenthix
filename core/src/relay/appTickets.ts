/**
 * The two tickets hq signs for a live preview's bytes (live preview spec sections 4 and 5), beside the file ticket and
 * the relay pass (tokens.ts), verified in the same place (`verifyRelayToken`). Each carries a `jti` of at least 128
 * random bits, which the party that takes it uses to take it once.
 *
 * - An **app ticket** opens one app for one person through one relay. The browser enters with it by a `POST` from
 *   hq's page to the app's address (appDoor.ts) before `enterBy`, for a cookie that lives no longer than the ticket;
 *   the relay keeps the ticket behind the cookie and presents it on every new stream (`app.serve`), where the site
 *   checks it again. It carries the site's own single-use ticket (`siteTicket`), which the site answered to hq's
 *   `livePreview.act` for that app and entry: the site redeems it on the ticket's first stream, so only an entry the
 *   site itself agreed to gets in. `aud` and `site` are the site serving the app.
 * - A **bundle ticket** carries one Git bundle (protocol/branchBundles.ts) from one site to another through one relay
 *   (`bundle.read` on the source's line, `bundle.write` on the destination's): a branch going to the site of its live
 *   preview, or commits coming back to the workspace's site. It names the bundle, both ends and the SHA-256 and size
 *   of the bundle's bytes, which the destination checks before it keeps them. `aud` is the relay that carries it;
 *   each site checks it is the end the ticket names.
 */
import type { HqTokenRegisteredClaims } from './tokens.js'

export const APP_TICKET_TOKEN_TYPE = 'app-ticket'
export const BUNDLE_TICKET_TOKEN_TYPE = 'bundle-ticket'

/** An app ticket's whole life, and so its cookie's at most. */
export const APP_TICKET_TTL_SECONDS = 15 * 60
/** How long after hq signs it the browser has to enter with it; within the site's own ticket's life. */
export const APP_TICKET_ENTRY_SECONDS = 60
/** How long after hq signs it the relay has to open a bundle's streams. A transfer under way finishes past it. */
export const BUNDLE_TICKET_TTL_SECONDS = 5 * 60

/** The ways an app is entered: in the workspace view, in a new tab, or renewing either's cookie. */
export const APP_ENTRIES = ['frame', 'tab', 'renew'] as const
export type AppEntry = (typeof APP_ENTRIES)[number]
/** Which cookie it sets: inside the workspace view, partitioned under hq; or at the top level of a tab (appDoor.ts). */
export const APP_COOKIE_KINDS = ['frame', 'tab'] as const
export type AppCookieKind = (typeof APP_COOKIE_KINDS)[number]

export interface AppTicketClaims extends HqTokenRegisteredClaims {
  tokenType: typeof APP_TICKET_TOKEN_TYPE
  jti: string
  /** The site serving the app; equals `aud`. */
  site: string
  relay: string
  person: string
  livePreviewId: string
  workspaceId: string
  /** The app's id: its address's (previewAddress.ts). */
  appId: string
  entry: AppEntry
  /** `frame` for an entry in the workspace view, `tab` for a new tab; a renewal renews either. */
  cookie: AppCookieKind
  /** Seconds since the epoch: the entry `POST` is refused at or after it. */
  enterBy: number
  /** The site's own ticket answering hq's `livePreview.act` for this app and entry. Never logged. */
  siteTicket: string
}

/**
 * Which way a bundle goes: `toPreview`, a branch (or `main`) to the site of a live preview of it on another site;
 * `back`, a branch's new commits from that site to the workspace's own.
 */
export const BUNDLE_DIRECTIONS = ['toPreview', 'back'] as const
export type BundleDirection = (typeof BUNDLE_DIRECTIONS)[number]

export interface BundleTicketClaims extends HqTokenRegisteredClaims {
  tokenType: typeof BUNDLE_TICKET_TOKEN_TYPE
  jti: string
  /** The relay that carries it; equals `aud`. */
  relay: string
  /** Who it was made for: the person whose live preview or work it is. */
  person: string
  /** The bundle, as the source site named it when it made it (`bundle.make`). */
  bundleId: string
  direction: BundleDirection
  workspaceId: string
  /** The branch it carries: its name, or `main`'s. */
  branch: string
  from: { site: string }
  to: { site: string }
  /** The bundle's SHA-256, lower-case hex, and its size in bytes, as the source site gave them. */
  sha256: string
  size: number
}

export type AppTicketInput = Omit<AppTicketClaims, keyof HqTokenRegisteredClaims | 'tokenType' | 'jti'>
export type BundleTicketInput = Omit<BundleTicketClaims, keyof HqTokenRegisteredClaims | 'tokenType' | 'jti'>
