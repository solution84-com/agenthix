import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAM, startHarness, type Harness } from './harness'
import { CONTAINER_PEER, PUBLISHED_PORT, loopbackOnly, peerAllowed } from '../http/guards'

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close() })

describe('what every request passes', () => {
  it('refuses a Host header that does not name the loopback (DNS rebinding) @SC-862', async () => {
    const res = await h.request('/api/status', { headers: { host: 'evil.example:4300' } })
    expect(res.status).toBe(421)
  })

  it('answers on localhost through an SSH tunnel on any port @SC-862', async () => {
    expect((await h.request('/api/status', { headers: { host: 'localhost:9000' } })).status).toBe(200)
  })

  it('refuses a request from another origin or another site @SC-862', async () => {
    const body = { username: SAM.username, password: SAM.password }
    expect((await h.request('/api/session', { method: 'POST', body, headers: { origin: 'http://evil.example' } })).status).toBe(403)
    expect((await h.request('/api/session', { method: 'POST', body, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    // hq's own plain-HTTP port on the same machine is another origin too.
    expect((await h.request('/api/session', { method: 'POST', body, headers: { origin: 'http://127.0.0.1:4100' } })).status).toBe(403)
  })

  it('refuses a state-changing request that is not JSON, as a form would send @SC-862', async () => {
    const res = await h.request('/api/session', {
      method: 'POST', body: 'username=sam&password=x', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.status).toBe(415)
  })

  it('opens a session only with the cookie and the CSRF token together @SC-863', async () => {
    const { cookie, csrf } = await h.signIn()
    expect((await h.request('/api/session', { cookie, csrf })).status).toBe(200)
    expect((await h.request('/api/session', { cookie })).status).toBe(401)
    expect((await h.request('/api/session', { csrf })).status).toBe(401)
    expect((await h.request('/api/fleet', { cookie, csrf: 'x'.repeat(43) })).status).toBe(401)
    expect((await h.request('/api/joins', { method: 'POST', body: {}, cookie })).status).toBe(401)
  })

  it('keeps only hashes of the session secrets in the state folder @SC-863', async () => {
    const { cookie, csrf } = await h.signIn()
    const stored = h.state.readText('sessions.json')!
    expect(stored).not.toContain(cookie.split('=')[1])
    expect(stored).not.toContain(csrf)
  })

  it('ends a session when hq no longer lists the person as a fleet admin @SC-863', async () => {
    const { cookie, csrf } = await h.signIn()
    h.link.handle('fleetAdmin.list', () => ({ admins: [] }))
    const session = h.ctx.sessions.find(cookie.split('=')[1], csrf)!
    session.roleCheckedAt = 0
    const res = await h.request('/api/fleet', { cookie, csrf })
    expect(res.status).toBe(401)
    expect(res.json.error).toBe('not_fleet_admin')
    expect(h.ctx.sessions.userIds()).not.toContain(SAM.id)
  })

  it('sends headers that keep the API out of frames and caches @SC-862', async () => {
    const res = await fetch(`${h.base}/api/status`)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })
})

describe('who may connect @SC-862', () => {
  const container = { address: '172.28.0.2', gateway: '172.28.0.1' }

  it('lets in the loopback, outside its container and in it', () => {
    expect(peerAllowed({ remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }, undefined)).toBe(true)
    expect(peerAllowed({ remoteAddress: '::ffff:127.0.0.1', localAddress: '::ffff:127.0.0.1' }, undefined)).toBe(true)
    expect(peerAllowed({ remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }, container)).toBe(true)
  })

  it('lets in its network’s gateway, through which Docker forwards the port published to 127.0.0.1', () => {
    expect(peerAllowed({ remoteAddress: '172.28.0.1', localAddress: '172.28.0.2' }, container)).toBe(true)
    expect(peerAllowed({ remoteAddress: '::ffff:172.28.0.1', localAddress: '::ffff:172.28.0.2' }, container)).toBe(true)
  })

  it('refuses the gateway outside its container: that is another machine’s address', () => {
    expect(peerAllowed({ remoteAddress: '172.28.0.1', localAddress: '172.28.0.2' }, undefined)).toBe(false)
  })

  it('refuses any other peer on its network, and anything arriving on another network it is on', () => {
    // Another address on its own network, or a machine that routed to it from outside.
    expect(peerAllowed({ remoteAddress: '172.28.0.3', localAddress: '172.28.0.2' }, container)).toBe(false)
    expect(peerAllowed({ remoteAddress: '192.168.1.20', localAddress: '172.28.0.2' }, container)).toBe(false)
    // HQ's link network: hq-web, a site, or that network's own gateway — whatever the peer.
    expect(peerAllowed({ remoteAddress: '172.29.0.5', localAddress: '172.29.0.3' }, container)).toBe(false)
    expect(peerAllowed({ remoteAddress: '172.29.0.1', localAddress: '172.29.0.3' }, container)).toBe(false)
    expect(peerAllowed({ remoteAddress: '172.28.0.1', localAddress: '172.29.0.3' }, container)).toBe(false)
    expect(peerAllowed({ remoteAddress: undefined, localAddress: undefined }, container)).toBe(false)
  })

  it('answers a peer it refuses with 403, and a gateway with the wrong Host header with 421 naming the published port @SC-1254', () => {
    const run = (remoteAddress: string, host: string, published?: number) => {
      const res = { code: 0, body: {} as Record<string, unknown>, status(c: number) { this.code = c; return this }, json(b: Record<string, unknown>) { this.body = b } }
      let passed = false
      const req = { socket: { remoteAddress, localAddress: '172.28.0.2' }, headers: { host }, app: { locals: { [CONTAINER_PEER]: container, ...(published ? { [PUBLISHED_PORT]: published } : {}) } } }
      loopbackOnly(req as never, res as never, () => { passed = true })
      return { passed, code: res.code, message: res.body.message }
    }
    expect(run('172.28.0.1', '127.0.0.1:4300')).toEqual({ passed: true, code: 0, message: undefined })
    expect(run('172.28.0.3', '127.0.0.1:4300').code).toBe(403)
    const rebound = run('172.28.0.1', 'evil.example:4300')
    expect(rebound.code).toBe(421)
    expect(rebound.message).toContain('http://127.0.0.1:7801')
    expect(run('172.28.0.1', 'evil.example:9000', 9000).message).toContain('http://127.0.0.1:9000')
  })
})
