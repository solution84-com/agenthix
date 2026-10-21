/**
 * hq tells a site its new address before it stops for a move (host-management spec §13): `site.hqAddress`, a request
 * on the channel the site already has, so hq knows which sites heard. The site keeps the address it has, checks the
 * new one with the move check (`host/moveCheck.ts`), and switches only once the check passes; until then it keeps
 * dialling the old one. Told the address it already uses, it stops waiting for a move — how hq calls one off.
 */

export const SITE_HQ_ADDRESS_METHOD = 'site.hqAddress'

export type SiteHqAddressParams = {
  /** The address hq will answer at, exactly as hq's own; the check binds its proofs to it. */
  address: string
}

export type SiteHqAddressResult = {
  /** False when the site refused the address (not one it may send its credential to); `problem` says why. */
  taken: boolean
  problem?: string
}
