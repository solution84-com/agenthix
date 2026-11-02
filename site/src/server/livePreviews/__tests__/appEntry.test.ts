/**
 * An app's entry (live preview spec section 4, *Opening it*): the site's own ticket is redeemed once, for exactly the
 * live preview, person, app and entry it was answered for; later streams of the same app ticket are let in while it
 * lives; and every ticket of a live preview goes when it pauses or stops.
 */
import { describe, expect, it, vi } from 'vitest'
import type { AppTicketClaims } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {} } }))

const { issueTicket, redeemTicket, voidTicketsOf } = await import('../livePreviewTickets')
const { admit } = await import('../apps/appServe')

const APP = 'abcdefghijklmnopqrstuvwxyz'
const want = { livePreviewId: 'lp-1', personId: 'p1', appId: APP, entry: 'frame' as const }

function claims(siteTicket: string, over: Partial<AppTicketClaims> = {}): AppTicketClaims {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: 'hq', aud: 'site-1', iat: now, exp: now + 900, tokenType: 'app-ticket', jti: `j${Math.random().toString(36).slice(2)}aaaaaaaaaaaaaaaaaaaaa`,
    site: 'site-1', relay: 'r1', person: 'p1', livePreviewId: 'lp-1', workspaceId: 'w1', appId: APP, entry: 'frame', cookie: 'frame',
    enterBy: now + 60, siteTicket, ...over,
  }
}

describe("the site's own tickets @SC-1737", () => {
  it('are taken once, and only for what they were answered for', () => {
    const t = issueTicket(want).ticket
    expect(redeemTicket(t, { ...want, personId: 'p2' })).toBe(false)
    const u = issueTicket(want).ticket
    expect(redeemTicket(u, want)).toBe(true)
    expect(redeemTicket(u, want)).toBe(false)
  })

  it('expire, and go when their live preview pauses or stops', () => {
    const t = issueTicket(want, 0).ticket
    expect(redeemTicket(t, want, 61_000)).toBe(false)
    const u = issueTicket(want).ticket
    voidTicketsOf('lp-1')
    expect(redeemTicket(u, want)).toBe(false)
  })
})

describe('app tickets on app.serve @SC-1737', () => {
  it('let in the first stream by the site\'s ticket and later streams of the same app ticket', () => {
    const c = claims(issueTicket(want).ticket)
    expect(admit(c, Date.now())).toEqual({ livePreviewId: 'lp-1' })
    expect(admit(c, Date.now())).toEqual({ livePreviewId: 'lp-1' })
  })

  it('refuse a second app ticket carrying the same site ticket, and one for another app', () => {
    const site = issueTicket(want).ticket
    expect(admit(claims(site), Date.now())).toEqual({ livePreviewId: 'lp-1' })
    expect(admit(claims(site), Date.now())).toBe('ticket-used')
    expect(admit(claims(issueTicket(want).ticket, { appId: 'bbbbbbbbbbbbbbbbbbbbbbbbbb' }), Date.now())).toBe('ticket-invalid')
  })

  it('refuse a ticket whose site ticket was never answered', () => {
    expect(admit(claims('made-up'), Date.now())).toBe('ticket-invalid')
  })
})
