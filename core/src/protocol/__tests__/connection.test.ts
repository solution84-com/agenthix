import { describe, it, expect } from 'vitest'
import {
  SITE_PROTOCOL_VERSION,
  SITE_PROTOCOL_VERSION_HEADER,
  HQ_SITE_CHANNEL_PATH,
  parseProtocolVersion,
} from '../connection.js'
import type { HQConnectionMessageType, ChannelRequestMessage, ChannelErrorMessage, SiteEventMessage } from '../channelMessages.js'
// Namespace import on purpose: the guard below enumerates what the protocol
// actually exports, so it cannot go stale against a hand-kept list.
import * as protocol from '../index.js'

describe('HQConnectionMessageType', () => {
  it('no longer includes the retired index-sync message types', () => {
    // This is a type-level check, not a runtime one: it only guards against
    // regression because `npm test` runs `pretest` -> `npm run typecheck` first
    // (see core/package.json). Vitest itself transpiles via esbuild, which
    // strips `@ts-expect-error` without validating it, so `vitest run` alone
    // would pass even if 'hq_index.push' were reintroduced below.
    // @ts-expect-error 'hq_index.push' must not be assignable to HQConnectionMessageType anymore
    const stillThere: HQConnectionMessageType = 'hq_index.push'
    void stillThere
  })
})

describe('control-channel protocol @SC-291 @SC-1128', () => {
  it('pins a major.minor version both apps compile against', () => {
    expect(SITE_PROTOCOL_VERSION).toBe('1.3')
    expect(parseProtocolVersion(SITE_PROTOCOL_VERSION)).toEqual({ major: 1, minor: 3 })
  })

  it('names its header after the site protocol', () => {
    expect(SITE_PROTOCOL_VERSION_HEADER).toBe('X-Site-Protocol-Version')
  })

  it('scopes the channel to its own path so socket.io keeps its own upgrades', () => {
    expect(HQ_SITE_CHANNEL_PATH).toBe('/hq-link')
    expect(HQ_SITE_CHANNEL_PATH.startsWith('/')).toBe(true)
  })

  it('carries the asking id and the answering id in separate fields', () => {
    const req: ChannelRequestMessage = {
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.request',
      siteId: 's1',
      requestId: '1',
      payload: { method: 'site.describe', params: {} },
    }
    const err: ChannelErrorMessage = {
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.error',
      siteId: 's1',
      replyTo: '1',
      payload: { message: 'Unknown method: nope', code: 'unknown_method' },
    }
    expect(err.replyTo).toBe(req.requestId)
    // A reply never carries requestId, and a request never carries replyTo —
    // that is what makes the role unambiguous without reading `type`.
    expect(req.replyTo).toBeUndefined()
    expect(err.requestId).toBeUndefined()
  })

  it('site.event is a member of the message type union', () => {
    const type: HQConnectionMessageType = 'site.event' // must compile: 'site.event' is a member
    expect(type).toBe('site.event')
  })

  it('site.event is one-way: SiteEventMessage forbids requestId at the type level', () => {
    const evt: SiteEventMessage = {
      version: SITE_PROTOCOL_VERSION,
      type: 'site.event',
      siteId: 's1',
      payload: { event: 'run.waiting', data: { runId: 'r1', sessionId: 's1', taskId: null, waiting: true } },
    }
    // This is a type-level check, not a runtime one: it only guards against
    // regression because `npm test` runs `pretest` -> `npm run typecheck` first
    // (see core/package.json). Vitest itself transpiles via esbuild, which
    // strips `@ts-expect-error` without validating it, so `vitest run` alone
    // would pass even if `requestId?: never`/`replyTo?: never` were dropped
    // from SiteEventMessage and it silently went back to inheriting the base
    // envelope's optional requestId.
    // @ts-expect-error SiteEventMessage forbids requestId — it is a one-way frame
    const withRequestId: SiteEventMessage = { ...evt, requestId: '1' }
    void withRequestId
  })
})

/**
 * At 1.0 every site speaks the whole protocol: a feature arrives on a minor, and a site one minor behind ignores
 * what it does not know (the compatibility rule), so hq gates nothing on a site's version.
 */
describe('the site protocol has no feature floors @SC-1128', () => {
  it('exports no *_MIN_PROTOCOL_VERSION', () => {
    expect(Object.keys(protocol).filter((name) => name.endsWith('_MIN_PROTOCOL_VERSION'))).toEqual([])
  })
})
