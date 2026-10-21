// @vitest-environment node
// Over 300 lines, not split: every case drives the one live server pair set up below, and splitting would duplicate that harness.
/**
 * The preview host, whole (adr-0071): the real routing on a real http server
 * that also carries a stand-in for hq, relaying to a real upstream standing in
 * for the agent's dev server. Only the preview row and the requester check are
 * stubbed.
 *
 * What it pins: a preview is served at its own host's root and only to an
 * entitled person holding that host's cookie; the cookie comes only from a
 * one-time ticket; nothing of the viewer's reaches the dev server; and hq's
 * own origin never serves a preview.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import express from 'express'

const { attachPreviewHost, createPreviewHost } = await import('../previewHost')
const { createTicketStore } = await import('../previewTicket')
const { signPreviewClaim, PREVIEW_COOKIE } = await import('../previewCookie')
const previewProxy = await import('../previewProxy')

const DOMAIN = 'preview.localhost'
const KEY = Buffer.alloc(32, 7)
const HOUR = 3_600_000

type Row = { id: string; status: string; expiresAt: Date; siteId: string; previewId: string }
let rows: Record<string, Row>
let entitled: Set<string>
let clock: number
let tickets: ReturnType<typeof createTicketStore>
let domain: string | null
const upstreamSeen: { url: string; headers: http.IncomingHttpHeaders; upgrade: boolean }[] = []
const hqSeen: string[] = []
const openSockets: net.Socket[] = []

let upstream: http.Server
let front: http.Server
let upstreamPort = 0
let port = 0

class ToUpstream extends http.Agent {
  override createConnection(): net.Socket {
    return net.connect(upstreamPort, '127.0.0.1')
  }
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    upstreamSeen.push({ url: req.url ?? '', headers: req.headers, upgrade: false })
    res.end(`upstream ${req.url}`)
  })
  upstream.on('upgrade', (req, socket) => {
    openSockets.push(socket as net.Socket)
    upstreamSeen.push({ url: req.url ?? '', headers: req.headers, upgrade: true })
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  })
  await new Promise<void>(r => upstream.listen(0, '127.0.0.1', r))
  upstreamPort = (upstream.address() as net.AddressInfo).port

  const hq = express()
  hq.use((req, res) => {
    hqSeen.push(req.url)
    res.status(404).send('hq')
  })
  front = http.createServer(hq)
  front.on('connection', s => openSockets.push(s))
  front.on('upgrade', (req, socket) => {
    hqSeen.push(`upgrade ${req.url}`)
    socket.destroy()
  })
  const host = createPreviewHost({
    domain: () => domain,
    hqClientUrl: () => 'http://hq.test:4100',
    cookieKey: () => KEY,
    tickets: {
      mint: (u, p) => tickets.mint(u, p),
      redeem: (t, p) => tickets.redeem(t, p),
    },
    trustProxy: 1,
    getById: async id => (rows[id] ?? null) as never,
    canAccess: async (user, s) => entitled.has(`${user.id}:${s.id}`),
    touch: async () => {},
    markStatus: async () => {},
    agentFor: () => new ToUpstream(),
    now: () => clock,
  })
  attachPreviewHost(front, host, () => domain)
  await new Promise<void>(r => front.listen(0, '127.0.0.1', r))
  port = (front.address() as net.AddressInfo).port
})

afterAll(async () => {
  for (const s of openSockets) s.destroy()
  upstream.closeAllConnections()
  await new Promise(r => front.close(r))
  await new Promise(r => upstream.close(r))
})

beforeEach(() => {
  clock = Date.now()
  domain = DOMAIN
  tickets = createTicketStore(() => clock)
  rows = {
    row1: { id: 'row1', status: 'running', expiresAt: new Date(clock + HOUR), siteId: 's', previewId: 'pv' },
    row2: { id: 'row2', status: 'running', expiresAt: new Date(clock + HOUR), siteId: 's', previewId: 'pv2' },
  }
  entitled = new Set(['u1:row1', 'u1:row2'])
  upstreamSeen.length = 0
  hqSeen.length = 0
})

interface Answer { status: number; headers: http.IncomingHttpHeaders; body: string }

function get(path: string, host: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host, ...headers } }, res => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

const previewHost = (id = 'row1') => `p-${id}.${DOMAIN}:${port}`
const cookieFor = (userId: string, previewId: string, exp = clock + HOUR) =>
  `${PREVIEW_COOKIE}=${signPreviewClaim({ userId, previewId, exp }, KEY)}`

/** The whole exchange: a ticket from hq, redeemed at the preview host for its cookie. */
async function enter(userId = 'u1', id = 'row1', headers: Record<string, string> = {}): Promise<Answer> {
  const ticket = tickets.mint(userId, id)
  return get(`/__agenthix/enter?ticket=${ticket}`, previewHost(id), headers)
}

function cookieFrom(answer: Answer): string {
  const set = answer.headers['set-cookie']?.[0] ?? ''
  return set.split(';')[0]
}

/** A raw WebSocket upgrade; resolves with whatever came back before the socket closed or 101 arrived. */
function upgrade(host: string, headers: Record<string, string> = {}, path = '/'): Promise<string> {
  return new Promise(resolve => {
    const sock = net.connect(port, '127.0.0.1', () => {
      const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
      sock.write(
        `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
          `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${extra}\r\n`,
      )
    })
    let got = ''
    sock.on('data', d => {
      got += d.toString()
      if (got.includes('\r\n\r\n')) {
        sock.destroy()
        resolve(got)
      }
    })
    sock.on('close', () => resolve(got))
    sock.on('error', () => resolve(got))
  })
}

describe('a preview host with no cookie', () => {
  it("sends the browser to hq's access check for that preview", async () => {
    const res = await get('/', previewHost())
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://hq.test:4100/open-preview/row1')
    expect(upstreamSeen).toHaveLength(0)
  })

  it('refuses a non-navigation outright', async () => {
    const res = await get('/api/x', previewHost(), {}, 'POST')
    expect(res.status).toBe(401)
    expect(upstreamSeen).toHaveLength(0)
  })
})

describe('the ticket exchange', () => {
  it('swaps a ticket for a host-only HttpOnly cookie and goes to the root', async () => {
    const res = await enter()
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
    const set = res.headers['set-cookie']?.[0] ?? ''
    expect(set).toMatch(new RegExp(`^${PREVIEW_COOKIE}=`))
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
    expect(set).toContain('Path=/')
    expect(set).not.toMatch(/Domain=/i)
    expect(set).not.toContain('Secure')
    // The exchange is answered here; the ticket never reaches the dev server.
    expect(upstreamSeen).toHaveLength(0)
  })

  it('marks the cookie Secure when the request arrived over HTTPS through a trusted proxy', async () => {
    const res = await enter('u1', 'row1', { 'x-forwarded-proto': 'https' })
    expect(res.headers['set-cookie']?.[0]).toContain('Secure')
  })

  it('refuses a ticket used twice', async () => {
    const ticket = tickets.mint('u1', 'row1')
    const first = await get(`/__agenthix/enter?ticket=${ticket}`, previewHost())
    const second = await get(`/__agenthix/enter?ticket=${ticket}`, previewHost())
    expect(first.status).toBe(302)
    expect(second.status).toBe(403)
    expect(second.headers['set-cookie']).toBeUndefined()
  })

  it('refuses a ticket past its minute', async () => {
    const ticket = tickets.mint('u1', 'row1')
    clock += 61_000
    const res = await get(`/__agenthix/enter?ticket=${ticket}`, previewHost())
    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it("refuses another preview's ticket", async () => {
    const ticket = tickets.mint('u1', 'row2')
    const res = await get(`/__agenthix/enter?ticket=${ticket}`, previewHost('row1'))
    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('issues no cookie to someone who has since lost access', async () => {
    const ticket = tickets.mint('u1', 'row1')
    entitled.clear()
    const res = await get(`/__agenthix/enter?ticket=${ticket}`, previewHost())
    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('never lets the cookie outlive the preview', async () => {
    rows.row1.expiresAt = new Date(clock + 90_000)
    const set = (await enter()).headers['set-cookie']?.[0] ?? ''
    expect(set).toContain('Max-Age=90')
  })
})

describe('an entitled person with the cookie', () => {
  it("is relayed at the root path, without our cookie but with the app's own", async () => {
    const cookie = cookieFrom(await enter())
    const res = await get('/src/main.jsx?t=1', previewHost(), {
      cookie: `app_session=abc; ${cookie}; theme=dark`,
      authorization: 'Bearer the-apps-own',
    })
    expect(res.status).toBe(200)
    expect(res.body).toBe('upstream /src/main.jsx?t=1')
    expect(upstreamSeen).toHaveLength(1)
    expect(upstreamSeen[0].url).toBe('/src/main.jsx?t=1')
    expect(upstreamSeen[0].headers.cookie).toBe('app_session=abc; theme=dark')
    expect(upstreamSeen[0].headers.cookie).not.toContain(PREVIEW_COOKIE)
    // hq's bearer never goes to a preview host, so this one is the app's own.
    expect(upstreamSeen[0].headers.authorization).toBe('Bearer the-apps-own')
    expect(hqSeen).toHaveLength(0)
  })

  it('sends no Cookie header at all when ours was the only one', async () => {
    const res = await get('/', previewHost(), { cookie: cookieFor('u1', 'row1') })
    expect(res.status).toBe(200)
    expect(upstreamSeen[0].headers.cookie).toBeUndefined()
  })

  it('sees the starting page while the preview is starting', async () => {
    rows.row1.status = 'starting'
    const res = await get('/', previewHost(), { cookie: cookieFor('u1', 'row1') })
    expect(res.status).toBe(200)
    expect(res.body).toContain('starting preview')
    expect(upstreamSeen).toHaveLength(0)
  })
})

describe('refusals', () => {
  it("refuses a cookie for another preview", async () => {
    const res = await get('/', previewHost('row1'), { cookie: cookieFor('u1', 'row2') })
    expect(res.status).toBe(403)
    expect(upstreamSeen).toHaveLength(0)
  })

  it('refuses an altered cookie', async () => {
    const cookie = cookieFor('u1', 'row1')
    const res = await get('/', previewHost(), { cookie: `${cookie.slice(0, -2)}xx` })
    expect(res.status).toBe(403)
    expect(upstreamSeen).toHaveLength(0)
  })

  it('refuses a person who is not entitled, even with a genuine cookie', async () => {
    const res = await get('/', previewHost(), { cookie: cookieFor('u2', 'row1') })
    expect(res.status).toBe(403)
    expect(upstreamSeen).toHaveLength(0)
  })

  it('refuses an ended preview even with a cookie', async () => {
    rows.row1.status = 'expired'
    const res = await get('/', previewHost(), { cookie: cookieFor('u1', 'row1') })
    expect(res.status).toBe(410)
    expect(upstreamSeen).toHaveLength(0)
  })

  it('answers 404 for a preview that does not exist', async () => {
    const res = await get('/', previewHost('nope'), { cookie: cookieFor('u1', 'nope') })
    expect(res.status).toBe(404)
  })

  it('sends an expired cookie back for a fresh ticket', async () => {
    const res = await get('/', previewHost(), { cookie: cookieFor('u1', 'row1', clock - 1) })
    expect(res.status).toBe(302)
    expect(upstreamSeen).toHaveLength(0)
  })
})

describe('the WebSocket door', () => {
  it("relays an upgrade carrying a valid cookie, without our cookie but with the app's own", async () => {
    const got = await upgrade(previewHost(), { cookie: `${cookieFor('u1', 'row1')}; app=1` }, '/?token=hmr')
    expect(got).toMatch(/^HTTP\/1\.1 101/)
    expect(upstreamSeen).toHaveLength(1)
    expect(upstreamSeen[0]).toMatchObject({ upgrade: true, url: '/?token=hmr' })
    expect(upstreamSeen[0].headers.cookie).toBe('app=1')
    expect(hqSeen).toHaveLength(0)
  })

  it('destroys an upgrade with no cookie', async () => {
    expect(await upgrade(previewHost())).toBe('')
    expect(upstreamSeen).toHaveLength(0)
    expect(hqSeen).toHaveLength(0)
  })

  it('destroys an upgrade with an invalid cookie', async () => {
    expect(await upgrade(previewHost(), { cookie: cookieFor('u1', 'row2') })).toBe('')
    expect(upstreamSeen).toHaveLength(0)
  })

  it('re-runs the requester check: a genuine cookie from someone not entitled is destroyed', async () => {
    expect(await upgrade(previewHost(), { cookie: cookieFor('u2', 'row1') })).toBe('')
    expect(upstreamSeen).toHaveLength(0)
  })

  it('destroys an upgrade onto an ended preview, even with a cookie', async () => {
    rows.row1.status = 'stopping'
    expect(await upgrade(previewHost(), { cookie: cookieFor('u1', 'row1') })).toBe('')
    expect(upstreamSeen).toHaveLength(0)
  })
})

describe("hq's own origin", () => {
  it('never serves a preview, whatever path or cookie is sent', async () => {
    const res = await get('/preview/row1/', `localhost:${port}`, { cookie: cookieFor('u1', 'row1') })
    expect(res.body).toBe('hq')
    expect(hqSeen).toEqual(['/preview/row1/'])
    expect(upstreamSeen).toHaveLength(0)
  })

  it("leaves hq's own upgrades to hq", async () => {
    await upgrade(`localhost:${port}`, { cookie: cookieFor('u1', 'row1') }, '/preview/row1/')
    expect(hqSeen).toEqual(['upgrade /preview/row1/'])
    expect(upstreamSeen).toHaveLength(0)
  })

  it('no longer offers a path door onto a preview', () => {
    expect(Object.keys(previewProxy)).not.toContain('registerPreviewHttp')
    expect(Object.keys(previewProxy)).not.toContain('registerPreviewUpgrade')
  })
})

describe('previews off', () => {
  it('serves no preview host at all when there is no preview domain', async () => {
    domain = null
    const res = await get('/', previewHost(), { cookie: cookieFor('u1', 'row1') })
    expect(res.body).toBe('hq')
    expect(upstreamSeen).toHaveLength(0)
  })
})
