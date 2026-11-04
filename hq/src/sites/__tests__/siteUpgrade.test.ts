import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import WebSocket from 'ws'
import { SITE_PROTOCOL_VERSION, parseProtocolVersion, SITE_PROTOCOL_VERSION_HEADER, HQ_SITE_REPLACED_HEADER, HQ_SITE_UNKNOWN_HEADER } from '@agenthix/core'
import { checkSiteUpgrade, type SiteUpgradeDeps } from '../siteUpgrade'

// Real sockets on a machine that may be running a whole suite: the logic is quick, the scheduling is not.
beforeAll(() => { vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 }) })
afterAll(() => { vi.resetConfig() })

const { major, minor } = parseProtocolVersion(SITE_PROTOCOL_VERSION)!

let server: http.Server
let port: number
const RESTORED_AT = new Date('2026-10-15T09:33:00.000Z')
let deps: SiteUpgradeDeps & { accepted: Array<{ siteId: string; speak: { major: number; minor: number } }> }

beforeEach(async () => {
  deps = {
    accepted: [],
    authenticate: vi.fn(async (siteId, credential) => (credential === 'good' && siteId === 's1' ? { siteId } : null)),
    // s1 is known; 'revoked' has a record but never authenticates; anything else has no record.
    siteExists: vi.fn(async siteId => siteId === 's1' || siteId === 'revoked'),
    recordProtocolVersion: vi.fn(async () => {}),
    markVersionMismatch: vi.fn(async () => {}),
    // s1 was restored onto another machine; 'old' is the credential the restore replaced.
    replacedAt: vi.fn(async (siteId, credential) => (siteId === 's1' && credential === 'old' ? RESTORED_AT : null)),
  }
  server = http.createServer((_q, r) => r.end())
  server.on('upgrade', async (req, socket) => {
    const result = await checkSiteUpgrade(req, socket, deps)
    if (result) {
      deps.accepted.push(result)
      socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
      socket.destroy()
    }
  })
  await new Promise<void>(r => server.listen(0, r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()))
})

function attempt(headers: Record<string, string>): Promise<{ status: number; required: string | undefined; unknown: string | undefined; replaced: string | undefined }> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/any`, { headers })
    ws.once('unexpected-response', (_req, res) => {
      resolve({ status: res.statusCode ?? 0, required: res.headers[SITE_PROTOCOL_VERSION_HEADER.toLowerCase()] as string | undefined, unknown: res.headers[HQ_SITE_UNKNOWN_HEADER.toLowerCase()] as string | undefined, replaced: res.headers[HQ_SITE_REPLACED_HEADER.toLowerCase()] as string | undefined })
      ws.terminate()
    })
    ws.once('error', () => {})
  })
}

const good = { Authorization: 'Bearer good', 'X-Site-Id': 's1', 'X-Site-Protocol-Version': SITE_PROTOCOL_VERSION }

describe('checkSiteUpgrade', () => {
  it('accepts the default site dialling hq-web by its container name on the private network — the Host is not checked', async () => {
    const hosts: Array<string | undefined> = []
    server.prependListener('upgrade', req => hosts.push(req.headers.host))
    await new Promise<void>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/any`, { headers: { ...good, Host: 'ns-hq-web:4100' } })
      ws.once('error', () => resolve())
      ws.once('unexpected-response', () => resolve())
      ws.once('upgrade', () => resolve())
      setTimeout(resolve, 300)
    })
    expect(hosts).toEqual(['ns-hq-web:4100'])
    expect(deps.accepted).toEqual([{ siteId: 's1', speak: { major, minor } }])
  })

  it('refuses a wrong credential with 401 whatever version it claims — a guesser learns nothing about versions', async () => {
    const res = await attempt({ ...good, Authorization: 'Bearer wrong', 'X-Site-Protocol-Version': `${major + 2}.0` })
    expect(res.status).toBe(401)
    expect(res.required).toBeUndefined()
    expect(deps.markVersionMismatch).not.toHaveBeenCalled()
  })

  it('refuses a missing credential with 401', async () => {
    const { Authorization: _a, ...headers } = good
    expect((await attempt(headers)).status).toBe(401)
  })

  describe('a site id hq has no record of', () => {
    it('is refused with 401 and the header that says the id is unknown', async () => {
      const res = await attempt({ ...good, 'X-Site-Id': 'ghost' })
      expect(res.status).toBe(401)
      expect(res.unknown).toBe('1')
      expect(deps.markVersionMismatch).not.toHaveBeenCalled()
    })

    it('says so whatever version it claims', async () => {
      const res = await attempt({ ...good, 'X-Site-Id': 'ghost', 'X-Site-Protocol-Version': `${major + 2}.0` })
      expect(res.status).toBe(401)
      expect(res.unknown).toBe('1')
    })

    it('is not asked about at all when the credential is right — authentication decides', async () => {
      await attempt(good)
      expect(deps.siteExists).not.toHaveBeenCalled()
    })

    it('is a plain 500 when the existence check itself throws', async () => {
      deps.siteExists = vi.fn(async () => { throw new Error('db down') })
      expect((await attempt({ ...good, 'X-Site-Id': 'ghost' })).status).toBe(500)
    })
  })

  it('refuses a wrong credential for a site hq does know with a plain 401 — no header, so a guessed id learns nothing', async () => {
    const res = await attempt({ ...good, Authorization: 'Bearer wrong' })
    expect(res.status).toBe(401)
    expect(res.unknown).toBeUndefined()
  })

  describe('the old machine\'s copy of a site a restore replaced', () => {
    it('is refused with 401 and told when the restore replaced it', async () => {
      const res = await attempt({ ...good, Authorization: 'Bearer old' })
      expect(res.status).toBe(401)
      expect(res.replaced).toBe(RESTORED_AT.toISOString())
      expect(res.unknown).toBeUndefined()
      expect(deps.accepted).toEqual([])
    })

    it('is told only with the very credential replaced: a wrong one, or the old one under another id, hears nothing', async () => {
      for (const headers of [{ ...good, Authorization: 'Bearer wrong' }, { ...good, Authorization: 'Bearer old', 'X-Site-Id': 'revoked' }]) {
        const res = await attempt(headers)
        expect(res.status).toBe(401)
        expect(res.replaced).toBeUndefined()
      }
    })

    it('is never asked about when the credential is right, nor for an id hq has no record of', async () => {
      await attempt(good)
      await attempt({ ...good, Authorization: 'Bearer old', 'X-Site-Id': 'ghost' })
      expect(deps.replacedAt).not.toHaveBeenCalled()
    })
  })

  it('refuses a revoked site with a plain 401 — its record exists', async () => {
    const res = await attempt({ ...good, 'X-Site-Id': 'revoked' })
    expect(res.status).toBe(401)
    expect(res.unknown).toBeUndefined()
  })

  it('refuses missing credentials with a plain 401, and never asks whether the id exists', async () => {
    const { Authorization: _a, ...noCredential } = good
    const { 'X-Site-Id': _s, ...noSiteId } = good
    for (const headers of [noCredential, noSiteId, {}]) {
      const res = await attempt(headers)
      expect(res.status).toBe(401)
      expect(res.unknown).toBeUndefined()
    }
    expect(deps.siteExists).not.toHaveBeenCalled()
  })

  function accept(version: string): Promise<void> {
    return new Promise<void>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/any`, { headers: { ...good, 'X-Site-Protocol-Version': version } })
      ws.once('error', () => resolve())
      ws.once('unexpected-response', () => resolve())
      ws.once('upgrade', () => resolve())
      setTimeout(resolve, 300)
    })
  }

  // At 1.0 no site can be two majors behind; those rows join the table from 2.0 on.
  it.each([
    ...(major >= 2 ? [['two majors behind', `${major - 2}.9`]] : []),
    ...(major >= 3 ? [['three majors behind', `${major - 3}.0`]] : []),
    ['two majors ahead', `${major + 2}.0`],
    ['three majors ahead', `${major + 3}.1`],
  ])('refuses an authenticated site %s with 426, stating hq\'s own version @SC-291', async (_label, version) => {
    const res = await attempt({ ...good, 'X-Site-Protocol-Version': version })
    expect(res.status).toBe(426)
    expect(res.required).toBe(SITE_PROTOCOL_VERSION)
    expect(deps.markVersionMismatch).toHaveBeenCalledWith('s1', version, expect.any(Date))
  })

  it('accepts a site one major behind, at the version it speaks @SC-291', async () => {
    await accept(`${major - 1}.4`)
    expect(deps.accepted).toEqual([{ siteId: 's1', speak: { major: major - 1, minor: 4 } }])
    expect(deps.markVersionMismatch).not.toHaveBeenCalled()
  })

  it('accepts a site one major ahead, at hq\'s own version: the site adapts @SC-291', async () => {
    await accept(`${major + 1}.0`)
    expect(deps.accepted).toEqual([{ siteId: 's1', speak: { major, minor } }])
    expect(deps.markVersionMismatch).not.toHaveBeenCalled()
  })

  it('refuses a site that states no version, as one that cannot be read @SC-291', async () => {
    const { 'X-Site-Protocol-Version': _v, ...headers } = good
    const res = await attempt(headers)
    expect(res.status).toBe(426)
    expect(res.required).toBe(SITE_PROTOCOL_VERSION)
  })

  it('records the mismatch against the authenticated site, with the version it presented @SC-291', async () => {
    await attempt({ ...good, 'X-Site-Protocol-Version': `${major + 2}.4` })
    expect(deps.markVersionMismatch).toHaveBeenCalledWith('s1', `${major + 2}.4`, expect.any(Date))
  })

  it('stamps the mismatch with when the handshake began — before authentication, not after it', async () => {
    let authStartedAt = Infinity
    deps.authenticate = vi.fn(async (siteId: string) => {
      authStartedAt = Date.now()
      await new Promise(r => setTimeout(r, 20))
      return { siteId }
    })

    await attempt({ ...good, 'X-Site-Protocol-Version': `${major + 2}.4` })

    const [, , attemptedAt] = vi.mocked(deps.markVersionMismatch).mock.calls[0]
    expect(attemptedAt.getTime()).toBeLessThanOrEqual(authStartedAt)
  })

  it('treats an unparseable version as a mismatch, recording what was sent @SC-291', async () => {
    const res = await attempt({ ...good, 'X-Site-Protocol-Version': 'six' })
    expect(res.status).toBe(426)
    expect(deps.markVersionMismatch).toHaveBeenCalledWith('s1', 'six', expect.any(Date))
  })

  it('accepts a matching major, records the version, and returns the version it speaks @SC-291', async () => {
    await accept(`${major}.0`)
    expect(deps.accepted).toEqual([{ siteId: 's1', speak: { major, minor: 0 } }])
    await vi.waitFor(() => expect(deps.recordProtocolVersion).toHaveBeenCalledWith('s1', `${major}.0`))
    expect(deps.markVersionMismatch).not.toHaveBeenCalled()
  })

  it('answers 500, not 401, when authentication itself throws', async () => {
    deps.authenticate = vi.fn(async () => { throw new Error('db down') })
    expect((await attempt(good)).status).toBe(500)
  })

  it('survives a client that resets while authentication is still pending, with no credential needed', async () => {
    let release!: () => void
    const pending = new Promise<void>(r => { release = r })
    let called!: () => void
    const authenticating = new Promise<void>(r => { called = r })
    deps.authenticate = vi.fn(async (siteId: string) => {
      called()
      await pending
      return { siteId }
    })
    const uncaught: unknown[] = []
    const collect = (err: unknown) => { uncaught.push(err) }
    process.on('uncaughtException', collect)
    try {
      const client = net.connect(port, '127.0.0.1')
      client.on('error', () => {})
      await new Promise<void>(r => client.once('connect', () => r()))
      client.write(
        'GET /hq-content HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Authorization: Bearer x\r\nX-Site-Id: s1\r\n\r\n',
      )
      await authenticating
      if (typeof client.resetAndDestroy === 'function') client.resetAndDestroy()
      else client.destroy()
      await new Promise(r => setTimeout(r, 50))
      release()
      await new Promise(r => setTimeout(r, 50))
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', collect)
    }
  })
})
