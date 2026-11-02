import { beforeAll, describe, expect, it } from 'vitest'
import { HQ_TOKEN_ISSUER } from '../../protocol/capability.js'
import { readAppTicketSite, readTicketRoute, verifyRelayToken } from '../verifyToken.js'
import { APP_TICKET_ENTRY_SECONDS, APP_TICKET_TTL_SECONDS, BUNDLE_TICKET_TTL_SECONDS } from '../appTickets.js'
import { makeSigner, withPayload, type TestSigner } from './tokenSigner.js'

const NOW = 1_800_000_000
const nowMs = NOW * 1000
const JTI = 'k3P0aZ-5mQ_r8wYt2LcV1n'
const APP_ID = 'abcdefghijklmnopqrstuvwxyz'
const SHA = 'a'.repeat(64)

const app = (over: Record<string, unknown> = {}) => ({
  iss: HQ_TOKEN_ISSUER, aud: 'site-1', iat: NOW, exp: NOW + APP_TICKET_TTL_SECONDS, jti: JTI, tokenType: 'app-ticket',
  site: 'site-1', relay: 'relay-1', person: 'person-1', livePreviewId: 'lp-1', workspaceId: 'w1', appId: APP_ID,
  entry: 'frame', cookie: 'frame', enterBy: NOW + APP_TICKET_ENTRY_SECONDS, siteTicket: 'site-ticket',
  ...over,
})
const bundle = (over: Record<string, unknown> = {}) => ({
  iss: HQ_TOKEN_ISSUER, aud: 'relay-1', iat: NOW, exp: NOW + BUNDLE_TICKET_TTL_SECONDS, jti: JTI, tokenType: 'bundle-ticket',
  relay: 'relay-1', person: 'person-1', bundleId: 'b1', direction: 'toPreview', workspaceId: 'w1', branch: 'add-login-page',
  from: { site: 'site-1' }, to: { site: 'preview-box' }, sha256: SHA, size: 10,
  ...over,
})

let hq: TestSigner
const asApp = (token: string, over: object = {}) =>
  verifyRelayToken(token, { type: 'app-ticket', keys: hq.keys, audience: 'site-1', relay: 'relay-1', nowMs, ...over })
const asBundle = (token: string, side: 'from' | 'to', audience: string, over: object = {}) =>
  verifyRelayToken(token, { type: 'bundle-ticket', keys: hq.keys, audience, side, relay: 'relay-1', nowMs, ...over })
const refusal = async (p: Promise<{ ok: boolean; refusal?: string }>) => (await p).refusal

beforeAll(async () => { hq = await makeSigner('hq-key-1') })

describe('an app ticket @SC-1749', () => {
  it('is accepted with only the fields an app ticket has', async () => {
    const verdict = await asApp(await hq.sign(app({ extra: 'never carried' })))
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.claims).toMatchObject({ appId: APP_ID, siteTicket: 'site-ticket', livePreviewId: 'lp-1', cookie: 'frame' })
    expect(verdict.claims).not.toHaveProperty('extra')
  })

  it('refuses a ticket for another site, another relay, or of another type', async () => {
    expect(await refusal(asApp(await hq.sign(app()), { audience: 'site-2' }))).toBe('wrong-audience')
    expect(await refusal(asApp(await hq.sign(app()), { relay: 'relay-2' }))).toBe('wrong-relay')
    expect(await refusal(verifyRelayToken(await hq.sign(app()), { type: 'file-ticket', keys: hq.keys, audience: 'site-1', nowMs })))
      .toBe('wrong-type')
  })

  it('refuses a life longer than a cookie may have, and a tampered one', async () => {
    expect(await refusal(asApp(await hq.sign(app({ exp: NOW + APP_TICKET_TTL_SECONDS + 1 }))))).toBe('expired')
    expect(await refusal(asApp(withPayload(await hq.sign(app()), app({ appId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }))))).toBe('forged')
  })

  it('refuses entry at or after enterBy, and an entry window longer than allowed', async () => {
    const token = await hq.sign(app())
    expect((await asApp(token, { entering: true })).ok).toBe(true)
    const late = NOW + APP_TICKET_ENTRY_SECONDS
    expect(await refusal(asApp(token, { entering: true, nowMs: late * 1000 }))).toBe('entry-closed')
    expect((await asApp(token, { nowMs: late * 1000 })).ok).toBe(true)
    expect(await refusal(asApp(await hq.sign(app({ enterBy: NOW + APP_TICKET_ENTRY_SECONDS + 1 }))))).toBe('malformed')
  })

  it('refuses claims that do not hold together', async () => {
    for (const over of [
      { jti: 'short' }, { appId: 'my-app' }, { site: 'site-2' }, { entry: 'tab' }, { cookie: 'window' },
      { siteTicket: '' }, { livePreviewId: undefined }, { workspaceId: undefined },
    ]) expect(await refusal(asApp(await hq.sign(app(over)))), JSON.stringify(over)).toBe('malformed')
    expect((await asApp(await hq.sign(app({ entry: 'renew', cookie: 'tab' })))).ok).toBe(true)
  })

  it("names its site for the relay, and is no file ticket's route", async () => {
    const token = await hq.sign(app())
    expect(readAppTicketSite(token)).toBe('site-1')
    expect(readTicketRoute(token)).toBeNull()
    expect(readAppTicketSite(await hq.sign(bundle()))).toBeNull()
  })
})

describe('a bundle ticket @SC-1715', () => {
  it('is accepted by the source as the source and the destination as the destination', async () => {
    const token = await hq.sign(bundle())
    expect(await asBundle(token, 'from', 'site-1')).toMatchObject({
      ok: true, claims: { sha256: SHA, size: 10, bundleId: 'b1', direction: 'toPreview', branch: 'add-login-page' },
    })
    expect((await asBundle(token, 'to', 'preview-box')).ok).toBe(true)
  })

  it('refuses a site that is not the end it asks as', async () => {
    const token = await hq.sign(bundle())
    expect(await refusal(asBundle(token, 'from', 'preview-box'))).toBe('wrong-audience')
    expect(await refusal(asBundle(token, 'to', 'site-1'))).toBe('wrong-audience')
    expect(await refusal(asBundle(token, 'to', 'preview-box', { relay: 'relay-2' }))).toBe('wrong-relay')
  })

  it('refuses claims that do not hold together', async () => {
    for (const over of [
      { to: { site: 'site-1' } }, { from: { site: 'site-1', loc: {} } }, { direction: 'sideways' },
      { sha256: 'ABC' }, { size: 0 }, { aud: 'relay-2' }, { jti: undefined }, { bundleId: '' }, { branch: undefined },
    ]) expect(await refusal(asBundle(await hq.sign(bundle(over)), 'to', 'preview-box')), JSON.stringify(over)).toBe('malformed')
  })

  it('refuses a life longer than a bundle ticket may have', async () => {
    expect(await refusal(asBundle(await hq.sign(bundle({ exp: NOW + BUNDLE_TICKET_TTL_SECONDS + 1 })), 'to', 'preview-box'))).toBe('expired')
  })
})
