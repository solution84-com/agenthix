/**
 * The Fleet Console's requests to hq over the console link (core's `ConsoleLinkMethods`): each one's parameters
 * checked, then passed to the service that does it. Closed: a method not in core's list is `unknown_method`. The
 * services are injected so that this file is the whole of what the link accepts and can be tested without a database.
 */
import {
  JOIN_CODE_TTL_MS,
  CLOUD_OFFER_NAMES,
  CONSOLE_LINK_METHODS,
  parseHostEnvelope,
  parseLivePreviewIdleMinutes,
  parseLivePreviewLimit,
  type LivePreviewLimit,
  type JoinAcceptance,
  type JoinPurpose,
  type CloudOfferName,
  type ConsoleHandoverAcceptance,
  type ConsoleLinkMethod,
  type ConsoleLinkMethods,
} from '@agenthix/core'
import { isHostIdentity } from '@agenthix/core/host-crypto'
import type { ConsoleAnswer } from './relay/consoleLinkServer'

type Result<M extends ConsoleLinkMethod> = ConsoleLinkMethods[M]['result']
type Params<M extends ConsoleLinkMethod> = ConsoleLinkMethods[M]['params']

/** A refusal a service gives, in words for the fleet admin. */
export class ConsoleRefusal extends Error {
  constructor(readonly code: 'not_allowed' | 'not_found' | 'failed' | 'rate_limited', message: string) {
    super(message)
  }
}

export type ConsoleServices = { [M in ConsoleLinkMethod]: (params: Params<M>) => Promise<Result<M>> }

class Malformed extends Error {}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const HEX64 = /^[0-9a-f]{64}$/
const BINDING = /^[A-Za-z0-9_-]{43}$/

function obj(params: unknown): Record<string, unknown> {
  if (params === undefined || params === null) return {}
  if (typeof params !== 'object' || Array.isArray(params)) throw new Malformed('Parameters are an object.')
  return params as Record<string, unknown>
}

function text(p: Record<string, unknown>, key: string, max: number, pattern?: RegExp): string {
  const v = p[key]
  if (typeof v !== 'string' || v.length === 0 || v.length > max || (pattern && !pattern.test(v))) {
    throw new Malformed(`'${key}' is missing or not valid.`)
  }
  return v
}

function bool(p: Record<string, unknown>, key: string): boolean {
  if (typeof p[key] !== 'boolean') throw new Malformed(`'${key}' is true or false.`)
  return p[key] as boolean
}

function time(p: Record<string, unknown>, key: string): string {
  const v = text(p, key, 40)
  if (Number.isNaN(Date.parse(v))) throw new Malformed(`'${key}' is a time.`)
  return new Date(v).toISOString()
}

function limit(p: Record<string, unknown>): LivePreviewLimit {
  const v = parseLivePreviewLimit(p.limit)
  if (v === undefined) throw new Malformed("'limit' is a whole number of live previews, or null for none.")
  return v
}

function idleMinutes(p: Record<string, unknown>): number {
  const v = parseLivePreviewIdleMinutes(p.idleMinutes)
  if (v === undefined) throw new Malformed("'idleMinutes' is a whole number of minutes.")
  return v
}

function purpose(v: unknown): JoinPurpose {
  const p = obj(v)
  if (p.kind === 'add' || p.kind === 'moveHq') return { kind: p.kind }
  if (p.kind === 'moveSite') return { kind: 'moveSite', siteId: text(p, 'siteId', 64, ID) }
  if (p.kind === 'restoreSite') return { kind: 'restoreSite', siteId: text(p, 'siteId', 64, ID) }
  throw new Malformed("'purpose' is add, moveSite, moveHq or restoreSite.")
}

function acceptance(v: unknown): JoinAcceptance {
  const p = obj(v)
  if (!isHostIdentity(p.identity) || p.identity.role !== 'console') throw new Malformed("'acceptance' names the Fleet Console's identity.")
  return {
    identity: { role: 'console', signingKey: p.identity.signingKey, sealingKey: p.identity.sealingKey },
    binding: text(p, 'binding', 43, BINDING),
  }
}

function handoverAcceptance(v: unknown): ConsoleHandoverAcceptance {
  const p = obj(v)
  if (!isHostIdentity(p.identity) || p.identity.role !== 'console') throw new Malformed("'acceptance' names the Fleet Console's identity.")
  const envelope = parseHostEnvelope(p.envelope)
  if (!envelope) throw new Malformed("'acceptance' carries an envelope.")
  return {
    identity: { role: 'console', signingKey: p.identity.signingKey, sealingKey: p.identity.sealingKey },
    binding: text(p, 'binding', 43, BINDING),
    envelope,
  }
}

function offerName(p: Record<string, unknown>): CloudOfferName {
  if (typeof p.offer === 'string' && (CLOUD_OFFER_NAMES as readonly string[]).includes(p.offer)) return p.offer as CloudOfferName
  throw new Malformed("'offer' is site, backups or address.")
}

/** Each method's parameters, as the service is given them. Anything not named here is dropped. */
const READ: { [M in ConsoleLinkMethod]: (p: Record<string, unknown>) => Params<M> } = {
  'signIn.check': p => ({ username: text(p, 'username', 200), password: text(p, 'password', 1024) }),
  'join.open': p => ({ lookup: text(p, 'lookup', 64, HEX64), expiresAt: time(p, 'expiresAt'), purpose: purpose(p.purpose) }),
  'join.close': p => ({ joinId: text(p, 'joinId', 64, ID) }),
  'join.accept': p => ({ joinId: text(p, 'joinId', 64, ID), acceptance: acceptance(p.acceptance) }),
  'join.refuse': p => ({ joinId: text(p, 'joinId', 64, ID) }),
  'host.list': () => ({}),
  'host.disconnect': p => ({ hostId: text(p, 'hostId', 64, ID) }),
  'site.register': p => ({
    hostId: text(p, 'hostId', 64, ID),
    credentialHash: text(p, 'credentialHash', 64, HEX64),
  }),
  'site.remove': p => ({ executionSiteId: text(p, 'executionSiteId', 64, ID) }),
  'fleetAdmin.grant': p => ({ userId: text(p, 'userId', 64, ID), byUserId: text(p, 'byUserId', 64, ID) }),
  'fleetAdmin.revoke': p => ({ userId: text(p, 'userId', 64, ID), byUserId: text(p, 'byUserId', 64, ID) }),
  'fleetAdmin.list': () => ({}),
  'activity.record': p => ({
    byUserId: p.byUserId === null ? null : text(p, 'byUserId', 64, ID),
    action: text(p, 'action', 200),
    subject: text(p, 'subject', 500),
    at: time(p, 'at'),
    announce: bool(p, 'announce'),
  }),
  'handover.open': p => ({ lookup: text(p, 'lookup', 64, HEX64), expiresAt: time(p, 'expiresAt') }),
  'handover.accept': p => ({ handoverId: text(p, 'handoverId', 64, ID), acceptance: handoverAcceptance(p.acceptance) }),
  'handover.close': p => ({ handoverId: text(p, 'handoverId', 64, ID) }),
  'transfer.open': p => ({
    transferId: text(p, 'transferId', 64, ID),
    fromHostId: text(p, 'fromHostId', 64, ID),
    toHostId: text(p, 'toHostId', 64, ID),
    expiresAt: time(p, 'expiresAt'),
  }),
  'transfer.close': p => ({ transferId: text(p, 'transferId', 64, ID) }),
  'site.move': p => ({ executionSiteId: text(p, 'executionSiteId', 64, ID), toHostId: text(p, 'toHostId', 64, ID) }),
  'hq.about': () => ({}),
  'site.loads': () => ({}),
  'relay.facts': () => ({}),
  'features.on': () => ({}),
  'activity.list': p => ({
    byUserId: text(p, 'byUserId', 64, ID),
    ...(p.after === undefined ? {} : { after: text(p, 'after', 64, ID) }),
  }),
  'notices.list': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'notices.dismiss': p => ({ byUserId: text(p, 'byUserId', 64, ID), noticeId: text(p, 'noticeId', 64, ID) }),
  // Usernames are kept lower-cased, as Wasp stores them.
  'account.find': p => ({ byUserId: text(p, 'byUserId', 64, ID), username: text(p, 'username', 200).trim().toLowerCase() }),
  'host.silenceFacts': p => ({
    hostId: text(p, 'hostId', 64, ID),
    notifyIfSilent: bool(p, 'notifyIfSilent'),
    stoppedAt: p.stoppedAt === null ? null : time(p, 'stoppedAt'),
  }),
  'sites.livePreviews': p => ({ byUserId: text(p, 'byUserId', 64, ID), executionSiteId: text(p, 'executionSiteId', 64, ID) }),
  'sites.livePreviews.set': p => ({
    byUserId: text(p, 'byUserId', 64, ID), executionSiteId: text(p, 'executionSiteId', 64, ID),
    allowed: bool(p, 'allowed'), limit: limit(p), idleMinutes: idleMinutes(p),
  }),
  'sites.livePreviews.stop': p => ({
    byUserId: text(p, 'byUserId', 64, ID), executionSiteId: text(p, 'executionSiteId', 64, ID),
    livePreviewId: text(p, 'livePreviewId', 64, ID),
  }),
  'cloud.state': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'cloud.connect': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'cloud.disconnect': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'cloud.askCount': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'cloud.offers': p => ({ byUserId: text(p, 'byUserId', 64, ID) }),
  'cloud.dismissOffer': p => ({ byUserId: text(p, 'byUserId', 64, ID), offer: offerName(p) }),
}

const KNOWN = new Set<string>(CONSOLE_LINK_METHODS)

export function isConsoleMethod(method: string): method is ConsoleLinkMethod {
  return KNOWN.has(method)
}

/** The longest a join may stay open, whatever the Fleet Console asks: a code works for one hour. */
export const MAX_JOIN_TTL_MS = JOIN_CODE_TTL_MS

export function consoleRequestHandler(services: ConsoleServices): (method: string, params: unknown) => Promise<ConsoleAnswer> {
  return async (method, params) => {
    if (!isConsoleMethod(method)) return { ok: false, code: 'unknown_method', message: `HQ does not answer '${method.slice(0, 64)}'.` }
    let read: unknown
    try {
      read = READ[method](obj(params))
    } catch (err) {
      if (err instanceof Malformed) return { ok: false, code: 'malformed', message: err.message }
      throw err
    }
    try {
      // `read` is READ[method]'s output, which is Params<typeof method>; TypeScript cannot follow the pairing
      // through the indexed call, hence the one cast.
      const call = services[method] as (p: unknown) => Promise<unknown>
      return { ok: true, result: await call(read) }
    } catch (err) {
      if (err instanceof ConsoleRefusal) return { ok: false, code: err.code, message: err.message }
      throw err
    }
  }
}
