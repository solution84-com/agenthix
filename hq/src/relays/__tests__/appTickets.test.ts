/**
 * hq's word on an app ticket when a relay asks, the refusal threshold, and a live app's address: a ticket stands only
 * while nothing revoked it and its live preview runs and is open to its person.
 */
import { describe, it, expect, vi } from 'vitest'
import { DEV_PREVIEW_PATTERN, type RelayRevoke } from '@agenthix/core'

vi.mock('../../server/siteConfig', () => ({ getSiteClientUrl: () => 'https://hq.example.com' }))

import { createAppTicketBook } from '../appTickets'
import { overRefusalThreshold } from '../appRefusalGuard'
import { appAddress, livePreviewPattern } from '../appAddress'

const APP = 'abcdefghijklmnopqrstuvwxyz'
const input = {
  site: 'site-1', relay: 'relay-1', person: 'mia', livePreviewId: 'lp1', workspaceId: 'ws-1', appId: APP, entry: 'frame' as const,
  cookie: 'frame' as const, siteTicket: 'site-ticket',
}

function book(open = true) {
  const state = { open }
  const sent: RelayRevoke[] = []
  const opened: Array<[string, string]> = []
  let n = 0
  const b = createAppTicketBook({
    sign: async () => ({ token: 't', expiresAt: Date.now() + 900_000, jti: `jti-${++n}`, enterBy: 0 }),
    livePreviewOpenTo: async (id, person) => { opened.push([id, person]); return state.open },
    broadcast: f => sent.push(f),
  })
  return { b, state, sent, opened }
}
const ask = (ticketId: string, over: object = {}) => ({ ticketId, person: 'mia', appId: APP, livePreviewId: 'lp1', ...over })

describe("hq's word on an app ticket @SC-1706", () => {
  it('stands for a ticket it signed, for that person, app and live preview, while it runs and is open to them', async () => {
    const { b, state, opened } = book()
    const { jti } = await b.issue(input)
    expect(await b.stands('relay-1', ask(jti))).toBe(true)
    expect(opened).toEqual([['lp1', 'mia']])
    expect(await b.stands('relay-1', ask('jti-unknown'))).toBe(false)
    expect(await b.stands('relay-2', ask(jti))).toBe(false)
    expect(await b.stands('relay-1', ask(jti, { person: 'sam' }))).toBe(false)
    expect(await b.stands('relay-1', ask(jti, { appId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }))).toBe(false)
    expect(await b.stands('relay-1', ask(jti, { livePreviewId: 'lp2' }))).toBe(false)
    state.open = false
    expect(await b.stands('relay-1', ask(jti))).toBe(false)
  })

  it('stops standing for a person cut off, and tells every relay', async () => {
    const { b, sent } = book()
    const { jti } = await b.issue(input)
    b.revoke({ person: 'mia' })
    expect(await b.stands('relay-1', ask(jti))).toBe(false)
    expect(sent).toEqual([{ type: 'relay.revoke', version: expect.any(String), person: 'mia' }])
  })

  it('stops standing for a live preview, an app or a ticket revoked', async () => {
    const { b, sent } = book()
    const one = await b.issue(input)
    b.revoke({ livePreviews: ['lp1'] })
    expect(await b.stands('relay-1', ask(one.jti))).toBe(false)
    const two = await b.issue(input)
    b.revoke({ apps: [APP] })
    expect(await b.stands('relay-1', ask(two.jti))).toBe(false)
    const three = await b.issue(input)
    b.revoke({ tickets: [three.jti] })
    expect(await b.stands('relay-1', ask(three.jti))).toBe(false)
    expect(sent.map(f => f.livePreviews ?? f.apps ?? f.tickets)).toEqual([['lp1'], [APP], [three.jti]])
  })
})

describe('relay refusals over the threshold @SC-1706', () => {
  it('cuts off an app another page hammers, not one whose page is merely stale', () => {
    expect(overRefusalThreshold([{ appId: 'a', refusal: 'cross-site', count: 60 }, { appId: 'a', refusal: 'navigation', count: 40 }])).toEqual(['a'])
    expect(overRefusalThreshold([{ appId: 'a', refusal: 'no-cookie', count: 500 }, { appId: 'b', refusal: 'cross-site', count: 99 }])).toEqual([])
  })
})

describe("a live app's address @SC-1707", () => {
  it("is built from the pattern, development's on localhost, and none on a bare address", () => {
    expect(appAddress(APP, 'https://p-{id}.preview.example.com')).toBe(`https://p-${APP}.preview.example.com`)
    expect(livePreviewPattern({ PREVIEW_PATTERN: 'https://p-{id}.apps.example.net' })).toBe('https://p-{id}.apps.example.net')
    expect(livePreviewPattern({ PREVIEW_PATTERN: 'http://p-{id}.preview.localhost:7800' }, 'http://localhost:7800')).toBe('http://p-{id}.preview.localhost:7800')
    expect(livePreviewPattern({}, 'http://localhost:4100')).toBe(DEV_PREVIEW_PATTERN)
    expect(livePreviewPattern({}, 'https://192.168.1.20')).toBeNull()
    expect(livePreviewPattern({}, 'http://192.168.1.20:7800')).toBeNull()
    expect(livePreviewPattern({ PREVIEW_PATTERN: 'not a pattern' }, 'https://hq.example.com')).toBeNull()
    expect(appAddress(APP, null)).toBeNull()
  })
})
