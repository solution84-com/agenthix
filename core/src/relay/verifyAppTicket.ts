/**
 * The claims of an app ticket and a bundle ticket, read after `verifyRelayToken` has checked the signature, the
 * issuer, the type and the life. Each answers the claims with only the fields its kind has, or why it is refused.
 */
import { isAppId } from './previewAddress.js'
import {
  APP_COOKIE_KINDS, APP_ENTRIES, APP_TICKET_ENTRY_SECONDS, BUNDLE_DIRECTIONS,
  type AppTicketClaims, type BundleTicketClaims,
} from './appTickets.js'
import type { RelayTokenRefusal } from './tokens.js'

type Problem = { refusal: RelayTokenRefusal; detail: string }
type Read<C> = { claims: C } | Problem

const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0')
const problem = (refusal: RelayTokenRefusal, detail: string): Problem => ({ refusal, detail })
/** A token id: at least 128 bits written as 22 or more URL-safe characters. */
const isJti = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{22,128}$/.test(v)
const one = <T extends string>(v: unknown, of: readonly T[]): v is T => typeof v === 'string' && (of as readonly string[]).includes(v)

export type AppTicketExpectation = {
  /** The relay the ticket must name: the relay itself at entry, the line's relay at a site. */
  relay?: string
  /** At the entry `POST`: refused at or after `enterBy`. */
  entering?: boolean
}

export function readAppTicket(
  c: Record<string, unknown>, base: Pick<AppTicketClaims, 'iss' | 'aud' | 'iat' | 'exp'>, audience: string,
  expect: AppTicketExpectation, nowSeconds: number,
): Read<AppTicketClaims> {
  if (c.aud !== audience) return problem('wrong-audience', 'made for another party')
  if (!isJti(c.jti)) return problem('malformed', 'no token id of enough randomness')
  for (const k of ['site', 'relay', 'person', 'livePreviewId', 'workspaceId', 'siteTicket'] as const) {
    if (!text(c[k])) return problem('malformed', `no ${k}`)
  }
  if (c.site !== c.aud) return problem('malformed', 'its site and audience disagree')
  if (!isAppId(c.appId)) return problem('malformed', 'not an app\'s id')
  if (!one(c.entry, APP_ENTRIES) || !one(c.cookie, APP_COOKIE_KINDS)) return problem('malformed', 'no entry or cookie')
  if (c.entry !== 'renew' && c.entry !== c.cookie) return problem('malformed', 'its entry and cookie disagree')
  const enterBy = c.enterBy
  if (!Number.isSafeInteger(enterBy) || (enterBy as number) <= base.iat || (enterBy as number) > base.iat + APP_TICKET_ENTRY_SECONDS
    || (enterBy as number) > base.exp) return problem('malformed', 'an entry time outside its life')
  if (expect.relay !== undefined && c.relay !== expect.relay) return problem('wrong-relay', 'made for another relay')
  if (expect.entering && nowSeconds >= (enterBy as number)) return problem('entry-closed', 'past its time to enter')
  return {
    claims: {
      ...base, ...(c.sub === undefined ? {} : { sub: c.sub as string }), tokenType: 'app-ticket', jti: c.jti,
      site: c.site as string, relay: c.relay as string, person: c.person as string, livePreviewId: c.livePreviewId as string,
      workspaceId: c.workspaceId as string, appId: c.appId, entry: c.entry, cookie: c.cookie, enterBy: enterBy as number,
      siteTicket: c.siteTicket as string,
    },
  }
}

export type BundleTicketExpectation = {
  /** Which end the reading site is: the source (`bundle.read`) or the destination (`bundle.write`). */
  side: 'from' | 'to'
  /** The relay whose line the ticket arrived on. Always given by a site. */
  relay?: string
}

function readEnd(v: unknown): { site: string } | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const e = v as Record<string, unknown>
  return Object.keys(e).length === 1 && text(e.site) ? { site: e.site } : null
}

/** `audience` is the reading site's own id, which must be the end `expect.side` names. */
export function readBundleTicket(
  c: Record<string, unknown>, base: Pick<BundleTicketClaims, 'iss' | 'aud' | 'iat' | 'exp'>, audience: string,
  expect: BundleTicketExpectation,
): Read<BundleTicketClaims> {
  if (!isJti(c.jti)) return problem('malformed', 'no token id of enough randomness')
  for (const k of ['relay', 'person', 'bundleId', 'workspaceId', 'branch'] as const) {
    if (!text(c[k])) return problem('malformed', `no ${k}`)
  }
  if (c.relay !== c.aud) return problem('malformed', 'its relay and audience disagree')
  if (!one(c.direction, BUNDLE_DIRECTIONS)) return problem('malformed', 'no direction')
  const from = readEnd(c.from)
  const to = readEnd(c.to)
  if (!from || !to) return problem('malformed', 'an end that is not a site')
  if (from.site === to.site) return problem('malformed', 'both ends are one site')
  if (typeof c.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(c.sha256)) return problem('malformed', 'no content hash')
  if (!Number.isSafeInteger(c.size) || (c.size as number) <= 0) return problem('malformed', 'no size')
  if ((expect.side === 'from' ? from : to).site !== audience) return problem('wrong-audience', 'this site is not that end of the bundle')
  if (expect.relay !== undefined && c.relay !== expect.relay) return problem('wrong-relay', 'made for another relay')
  return {
    claims: {
      ...base, ...(c.sub === undefined ? {} : { sub: c.sub as string }), tokenType: 'bundle-ticket', jti: c.jti,
      relay: c.relay as string, person: c.person as string, bundleId: c.bundleId as string, direction: c.direction,
      workspaceId: c.workspaceId as string, branch: c.branch as string, from, to, sha256: c.sha256, size: c.size as number,
    },
  }
}
