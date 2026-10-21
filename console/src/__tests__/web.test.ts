/** The screens: the built web app served behind the same guards as the API, from a fixture build. */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../http/app'
import { listen } from '../console'
import { startHarness, type Harness } from './harness'

const INDEX = '<!doctype html><html data-portal="fleet-console"><body><div id="root"></div></body></html>'

let h: Harness
let server: http.Server
let port: number

function fixtureBuild(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-web-'))
  fs.mkdirSync(path.join(root, 'assets'))
  fs.writeFileSync(path.join(root, 'index.html'), INDEX)
  fs.writeFileSync(path.join(root, 'theme-init.js'), '// theme')
  fs.writeFileSync(path.join(root, 'assets', 'index-Ab12Cd34.js'), 'console.log(1)')
  return root
}

beforeEach(async () => {
  h = await startHarness()
  server = await listen(createApp(h.ctx, { webRoot: fixtureBuild() }), '127.0.0.1', 0)
  const address = server.address()
  port = typeof address === 'object' && address ? address.port : 0
})
afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()))
  await h.close()
})

function get(p: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('the screens', () => {
  it('serves the app at its root and falls back to it for the routes of the app, never cached @SC-865', async () => {
    for (const p of ['/', '/fleet', '/sites/office-server']) {
      const res = await get(p)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/^text\/html/)
      expect(res.body).toBe(INDEX)
      expect(res.headers['cache-control']).toBe('no-store')
    }
  })

  it('gives no HTML to a request whose Host header does not name the loopback @SC-862', async () => {
    for (const p of ['/', '/fleet', '/assets/index-Ab12Cd34.js']) {
      const res = await get(p, { host: 'evil.example:4300' })
      expect(res.status).toBe(421)
      expect(res.headers['content-type']).toMatch(/^application\/json/)
      expect(res.body).not.toContain('<html')
      expect(res.body).not.toContain('console.log')
    }
  })

  it('refuses the app to a page of another site @SC-862', async () => {
    const res = await get('/', { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('<html')
  })

  it('lets the hashed assets be cached, and nothing else @SC-865', async () => {
    const asset = await get('/assets/index-Ab12Cd34.js')
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const script = await get('/theme-init.js')
    expect(script.status).toBe(200)
    expect(script.headers['cache-control']).toBe('no-store')
  })

  it('answers 404 for a file that is not there, rather than the app @SC-865', async () => {
    for (const p of ['/assets/gone-00000000.js', '/favicon.ico', '/assets']) {
      const res = await get(p)
      expect(res.status).toBe(404)
      expect(res.body).not.toContain('<html')
    }
  })

  it('keeps the API its own: an unknown request is JSON, never the app @SC-865', async () => {
    const { cookie, csrf } = await h.signIn()
    const signedOut = await get('/api/nothing-here')
    expect(signedOut.status).toBe(401)
    expect(signedOut.body).not.toContain('<html')
    const res = await get('/api/nothing-here', { cookie, 'x-csrf-token': csrf })
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/^application\/json/)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('does not fall back to the app for a request that changes state @SC-865', async () => {
    expect((await get('/fleet', {}, 'POST')).status).toBe(404)
  })

  it("allows the app's own scripts, styles, fonts and images, and nothing inline or from elsewhere @SC-862", async () => {
    const csp = String((await get('/')).headers['content-security-policy'])
    const directives = Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]))
    expect(directives['default-src']).toBe("'none'")
    for (const d of ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src']) expect(directives[d]).toBe("'self'")
    expect(directives['frame-ancestors']).toBe("'none'")
    expect(csp).not.toContain('unsafe')
    expect(csp).not.toMatch(/https?:|data:|\*/)
  })

  it('serves no screens when there is no build, and the API still answers @SC-865', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'console-web-empty-'))
    const bare = await listen(createApp(h.ctx, { webRoot: empty }), '127.0.0.1', 0)
    const address = bare.address()
    const barePort = typeof address === 'object' && address ? address.port : 0
    try {
      const at = (p: string) => new Promise<number>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: barePort, path: p }, res => { res.resume(); resolve(res.statusCode ?? 0) }).on('error', reject)
      })
      expect(await at('/')).toBe(404)
      expect(await at('/api/status')).toBe(200)
    } finally {
      await new Promise<void>(r => bare.close(() => r()))
    }
  })
})
