/**
 * A live app's requests and WebSockets carried over the site's line: only the app's own pages get
 * through, hq is asked before every stream, the app's cookies stay on its own address, and a revocation ends what is
 * open at once.
 */
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { appRefusalHead } from '@agenthix/core'
import { startRelay, until, type Harness } from '../test/harness'
import { passClaims } from '../test/signer'
import {
  APP_ID, AppSite, OTHER_APP_ID, PATTERN, appHost, appOrigin, appTicketClaims, type AppHandler,
} from '../test/appSite'
import { OWN_PAGE, SAME_ORIGIN, cookieOf, enter, send } from '../test/appBrowser'

let relay: Harness
let site: AppSite
afterEach(async () => {
  await site?.close()
  await relay?.close()
})

type Ask = { ticketId: string; person: string; appId: string; livePreviewId: string }

async function start(handler: AppHandler, stands: () => boolean = () => true) {
  const asks: Ask[] = []
  relay = await startRelay({ previewPattern: PATTERN, ask: async q => { asks.push(q); return stands() } })
  site = await AppSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, handler)
  await until(() => relay.lines.current('site-1') !== null)
  const ticket = relay.signer.sign(appTicketClaims())
  const cookie = cookieOf(await enter(relay.port, ticket))
  return { asks, ticket, cookie }
}

const ok: AppHandler = () => ({ head: { status: 200, headers: [['content-type', 'text/html']] }, body: '<h1>app</h1>' })

describe('carrying an app\'s requests @SC-1750', () => {
  it('carries the app\'s own page to the site with the ticket, and back with the app\'s headers @P4', async () => {
    const { asks, ticket, cookie } = await start(() => ({
      head: {
        status: 200,
        headers: [
          ['content-type', 'text/html'], ['set-cookie', 'sid=1; Domain=preview.example.com; Path=/'],
          ['set-cookie', '__Host-preview-frame=stolen; Path=/'], ['set-cookie', 'theme=dark'],
        ],
      },
      body: '<h1>app</h1>',
    }))
    const a = await send(relay.port, '/index.html?x=1', { headers: { ...OWN_PAGE, Cookie: `${cookie}; theme=light` } })
    expect(a.status).toBe(200)
    expect(a.body.toString()).toBe('<h1>app</h1>')
    expect(a.headers['set-cookie']).toEqual(['sid=1; Path=/', 'theme=dark'])
    expect(String(a.headers['content-security-policy'])).toBe("frame-ancestors 'self' https://hq.example.com")
    const asked = site.asked[0].params
    expect(asked.ticket).toBe(ticket)
    expect(asked.request).toMatchObject({ method: 'GET', target: '/index.html?x=1' })
    expect(asked.request.headers).toContainEqual(['cookie', 'theme=light'])
    expect(asked.request.headers.some(([n]) => n === 'host')).toBe(false)
    expect(asks).toEqual([{ ticketId: expect.any(String), person: 'person-1', appId: APP_ID, livePreviewId: 'preview-1' }])
  })

  it('carries a request\'s body to the app', async () => {
    const { cookie } = await start(asked => ({ head: { status: 201, headers: [] }, body: `got ${asked.body.length}` }))
    const body = Buffer.alloc(3 * 1024 * 1024, 7)
    const a = await send(relay.port, '/api', { method: 'POST', body, headers: { ...SAME_ORIGIN, Cookie: cookie } })
    expect(a.status).toBe(201)
    expect(a.body.toString()).toBe(`got ${body.length}`)
  })

  it('refuses without the relay\'s cookie, and asks nothing of the site', async () => {
    await start(ok)
    const a = await send(relay.port, '/', { headers: OWN_PAGE })
    expect(a.status).toBe(401)
    expect(site.asked).toHaveLength(0)
  })

  it('counts nothing for requests without a cookie it gave out, however many: anyone who knows the address can send them', async () => {
    await start(ok)
    const strangers: Record<string, string>[] = [
      {}, { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'script' },
      { ...OWN_PAGE, Cookie: '__Host-preview-frame=made-up; __Host-preview-tab=made-up' },
    ]
    for (let i = 0; i < 5; i++) for (const headers of strangers) expect((await send(relay.port, '/', { headers })).status).toBeGreaterThanOrEqual(400)
    expect(relay.refusals.drain()).toEqual([])
  })

  it('counts a refusal for a cookie it held once the entry was cut off: a stale page of the person\'s', async () => {
    const { cookie } = await start(ok)
    relay.jar.revoke({ apps: [APP_ID] })
    expect((await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(401)
    expect(relay.refusals.drain()).toEqual([{ appId: APP_ID, refusal: 'no-cookie', count: 1 }])
  })

  it('refuses a sibling app\'s page, a request without fetch metadata, and a navigation from elsewhere', async () => {
    const { cookie } = await start(ok)
    const tries: Record<string, string>[] = [
      { 'Sec-Fetch-Site': 'same-site', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' },
      { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'script' },
      { 'Sec-Fetch-Site': 'same-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
      { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' },
      {},
    ]
    for (const headers of tries) expect((await send(relay.port, '/', { headers: { ...headers, Cookie: cookie } })).status).toBe(403)
    expect(site.asked).toHaveLength(0)
    expect(relay.refusals.drain()).toEqual(expect.arrayContaining([
      { appId: APP_ID, refusal: 'cross-site', count: 2 }, { appId: APP_ID, refusal: 'navigation', count: 2 },
      { appId: APP_ID, refusal: 'no-fetch-metadata', count: 1 },
    ]))
  })

  it('lets through a navigation the person made at the top level', async () => {
    const { cookie } = await start(ok)
    const a = await send(relay.port, '/', { headers: { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Cookie: cookie } })
    expect(a.status).toBe(200)
  })

  it('sends a navigation from outside any page to the app\'s top, without carrying it to the app', async () => {
    const { cookie } = await start(ok)
    const a = await send(relay.port, '/admin/reset?all=1', { headers: { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Cookie: cookie } })
    expect(a.status).toBe(303)
    expect(a.headers.location).toBe('/')
    expect(site.asked).toHaveLength(0)
  })

  it('does not take one app\'s cookie at another app\'s address', async () => {
    const { cookie } = await start(ok)
    expect((await send(relay.port, '/', { host: appHost(OTHER_APP_ID), headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(401)
  })

  it('refuses, and forgets the cookie, when hq says the ticket no longer stands', async () => {
    let stands = false
    const { cookie } = await start(ok, () => stands)
    expect((await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(403)
    stands = true
    expect((await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(401)
    expect(site.asked).toHaveLength(0)
  })

  it('takes hq\'s yes again for a moment, so an app\'s page in a loop does not ask hq on every stream; a revocation still cuts at once', async () => {
    const { asks, cookie } = await start(ok)
    for (let i = 0; i < 5; i++) expect((await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(200)
    expect(asks).toHaveLength(1)
    relay.jar.revoke({ apps: [APP_ID] })
    expect((await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })).status).toBe(401)
    expect(asks).toHaveLength(1)
  })

  it('answers the site\'s refusal in words, with its status', async () => {
    const { cookie } = await start(() => ({ head: appRefusalHead('preview-not-running') }))
    const a = await send(relay.port, '/', { headers: { ...OWN_PAGE, Cookie: cookie } })
    expect(a.status).toBe(409)
    expect(a.body.toString()).toMatch(/live preview isn't running/)
  })

  it('ends a response under way when hq revokes the person, and the site sees it cancelled', async () => {
    const { cookie } = await start(() => ({ head: { status: 200, headers: [['content-type', 'text/event-stream']] }, body: 'data: 1\n\n', endAfter: false }))
    const pending = send(relay.port, '/events', { headers: { ...SAME_ORIGIN, Cookie: cookie } })
    await until(() => site.asked.length === 1 && relay.appLoad.openStreams === 1)
    relay.jar.revoke({ person: 'person-1' })
    await pending
    await until(() => site.asked[0].cancelled && relay.appLoad.openStreams === 0)
  })
})

describe('carrying an app\'s WebSockets @SC-1750', () => {
  const echo: AppHandler = asked => ({
    head: { status: 101, headers: [], websocket: { protocol: asked.params.request.websocket?.protocols[0] ?? null } },
  })

  function open(cookie: string, origin = appOrigin()): Promise<WebSocket | number> {
    return new Promise(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/hmr`, ['vite-hmr'], {
        headers: { Host: appHost(), Origin: origin, Cookie: cookie, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'websocket', 'Sec-Fetch-Dest': 'empty' },
      })
      ws.on('open', () => resolve(ws))
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
      ws.on('error', () => {})
    })
  }

  it('carries messages both ways with the subprotocol the app chose', async () => {
    const { cookie } = await start(echo)
    const ws = await open(cookie)
    if (typeof ws === 'number') throw new Error(`refused ${ws}`)
    expect(ws.protocol).toBe('vite-hmr')
    const got = new Promise<string>(resolve => ws.once('message', d => resolve(d.toString())))
    ws.send('{"type":"ping"}')
    expect(await got).toBe('{"type":"ping"}')
    expect(site.asked[0].params.request.websocket).toEqual({ protocols: ['vite-hmr'] })
    ws.close()
  })

  it('refuses a WebSocket opened by any page but the app\'s own', async () => {
    const { cookie } = await start(echo)
    expect(await open(cookie, appOrigin(OTHER_APP_ID))).toBe(403)
    expect(await open(cookie, 'https://hq.example.com')).toBe(403)
    expect(site.asked).toHaveLength(0)
  })

  it('closes an open WebSocket when hq revokes the app', async () => {
    const { cookie } = await start(echo)
    const ws = await open(cookie)
    if (typeof ws === 'number') throw new Error(`refused ${ws}`)
    const closed = new Promise<void>(resolve => ws.once('close', () => resolve()))
    relay.jar.revoke({ apps: [APP_ID] })
    await closed
    await until(() => relay.appLoad.openStreams === 0)
  })
})
