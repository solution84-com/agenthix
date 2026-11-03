/**
 * Entering a live app at the relay: only from hq's page, only with a ticket hq signed for this relay and
 * this app, once, within its time to enter, for a host-only cookie that lives no longer than the ticket.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { APP_ENTRY_PATH } from '@agenthix/core'
import { startRelay, type Harness } from '../test/harness'
import { APP_ID, OTHER_APP_ID, PATTERN, appOrigin, appTicketClaims } from '../test/appSite'
import { cookieOf, enter, send } from '../test/appBrowser'

let relay: Harness
afterEach(async () => { await relay?.close() })

async function start() {
  relay = await startRelay({ previewPattern: PATTERN, ask: async () => true })
  return (over: Record<string, unknown> = {}) => relay.signer.sign(appTicketClaims(over))
}

describe('entering a live app @SC-1749', () => {
  it('sets a partitioned host-only cookie for hq\'s viewer, holding a handle and never the ticket', async () => {
    const ticket = await start()
    const t = ticket()
    const a = await enter(relay.port, t)
    expect(a.status).toBe(200)
    const set = String(a.headers['set-cookie'])
    expect(set).toMatch(/^__Host-preview-frame=[A-Za-z0-9_-]{43}; Secure; HttpOnly; Path=\/; SameSite=None; Partitioned; Max-Age=\d+$/)
    expect(Number(/Max-Age=(\d+)/.exec(set)![1])).toBeLessThanOrEqual(15 * 60)
    expect(set).not.toContain(t)
    expect(set).not.toMatch(/Domain/i)
    expect(String(a.headers['content-security-policy'])).toContain("frame-ancestors 'self' https://hq.example.com")
    // The page moves itself to `/`, so the next navigation is the app's own.
    expect(a.body.toString()).toContain('location.replace("/")')
    expect(relay.jar.size).toBe(1)
  })

  it('sets a strict cookie for a new tab, entered at the top level', async () => {
    const ticket = await start()
    const a = await enter(relay.port, ticket({ entry: 'tab', cookie: 'tab' }), { dest: 'document' })
    expect(a.status).toBe(200)
    expect(String(a.headers['set-cookie'])).toMatch(/^__Host-preview-tab=[^;]+; Secure; HttpOnly; Path=\/; SameSite=Strict; Max-Age=/)
  })

  it('renews without moving the page', async () => {
    const ticket = await start()
    const a = await enter(relay.port, ticket({ entry: 'renew', cookie: 'frame' }))
    expect(a.status).toBe(204)
    expect(cookieOf(a)).toMatch(/^__Host-preview-frame=/)
  })

  it('takes a ticket once, and counts a replay of a real one (X14)', async () => {
    const ticket = await start()
    const t = ticket()
    expect((await enter(relay.port, t)).status).toBe(200)
    const again = await enter(relay.port, t)
    expect(again.status).toBe(403)
    expect(again.headers['set-cookie']).toBeUndefined()
    expect(relay.refusals.drain()).toEqual([{ appId: APP_ID, refusal: 'ticket', count: 1 }])
  })

  it('refuses an entry not sent from hq\'s page: a sibling app\'s, a link, a missing Origin', async () => {
    const ticket = await start()
    expect((await enter(relay.port, ticket(), { origin: appOrigin(OTHER_APP_ID) })).status).toBe(403)
    expect((await enter(relay.port, ticket(), { origin: 'null' })).status).toBe(403)
    const link = await send(relay.port, `${APP_ENTRY_PATH}?ticket=${ticket()}`, {
      headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
    })
    expect(link.status).toBe(403)
    expect(relay.jar.size).toBe(0)
    // Nothing here shows a page that entered the app: anyone who knows the address can send these, so none is counted.
    expect(relay.refusals.drain()).toEqual([])
  })

  it('refuses a ticket for another app, another relay, past its time to enter, or not signed by hq', async () => {
    const ticket = await start()
    expect((await enter(relay.port, ticket({ appId: OTHER_APP_ID }))).status).toBe(403)
    expect((await enter(relay.port, ticket({ relay: 'relay-2' }))).status).toBe(403)
    const iat = Math.floor(Date.now() / 1000) - 120
    expect((await enter(relay.port, ticket({ iat, exp: iat + 900, enterBy: iat + 60 }))).status).toBe(403)
    const forged = ticket().split('.')
    forged[2] = forged[2].slice(0, -4) + 'AAAA'
    expect((await enter(relay.port, forged.join('.'))).status).toBe(403)
    expect(relay.jar.size).toBe(0)
    expect(relay.refusals.drain()).toEqual([])
  })

  it('refuses a viewer\'s ticket entered at the top level, and a tab\'s entered in a frame', async () => {
    const ticket = await start()
    expect((await enter(relay.port, ticket(), { dest: 'document' })).status).toBe(403)
    expect((await enter(relay.port, ticket({ entry: 'tab', cookie: 'tab' }), { dest: 'iframe' })).status).toBe(403)
    expect(relay.refusals.drain()).toEqual([{ appId: APP_ID, refusal: 'framing', count: 2 }])
  })

  it('refuses a ticket signed before hq cut its person off, and takes one signed after', async () => {
    const ticket = await start()
    const signedBefore = ticket({ iat: Math.floor(Date.now() / 1000) - 5 })
    relay.jar.revoke({ person: 'person-1' })
    expect((await enter(relay.port, signedBefore)).status).toBe(403)
    const later = Math.floor(Date.now() / 1000) + 2
    expect((await enter(relay.port, ticket({ iat: later, enterBy: later + 30 }))).status).toBe(200)
  })

  it('refuses a ticket of a live preview hq cut off', async () => {
    const ticket = await start()
    relay.jar.revoke({ livePreviews: ['preview-1'] })
    expect((await enter(relay.port, ticket())).status).toBe(403)
  })

  it('takes a ticket of that live preview signed after it was cut off: it paused and resumed', async () => {
    const ticket = await start()
    relay.jar.revoke({ livePreviews: ['preview-1'] })
    const later = Math.floor(Date.now() / 1000) + 2
    expect((await enter(relay.port, ticket({ iat: later, enterBy: later + 30 }))).status).toBe(200)
  })

  it('takes a ticket of an app signed after hq cut the app off: it started again', async () => {
    const ticket = await start()
    relay.jar.revoke({ apps: [APP_ID] })
    expect((await enter(relay.port, ticket())).status).toBe(403)
    const later = Math.floor(Date.now() / 1000) + 2
    expect((await enter(relay.port, ticket({ iat: later, enterBy: later + 30 }))).status).toBe(200)
  })
})

describe('the preview addresses the relay answers @SC-1751', () => {
  it('answers its own check name, refuses a name that is no app\'s, and leaves every other host to the files door', async () => {
    await start()
    expect((await send(relay.port, '/', { host: 'p-check.preview.example.com' })).status).toBe(200)
    expect((await send(relay.port, '/', { host: 'p-nope.preview.example.com' })).status).toBe(404)
    const files = await send(relay.port, '/', { host: 'files.example.com' })
    expect(files.status).toBe(404)
    expect(files.body.toString()).toBe('Not found.')
  })

  it('answers no preview address with live apps off', async () => {
    relay = await startRelay()
    const a = await send(relay.port, '/')
    expect(a.status).toBe(404)
    expect(a.body.toString()).toBe('Not found.')
  })
})
