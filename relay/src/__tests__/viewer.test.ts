import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { APP_HOST, APP_ORIGIN, ask, startRelay, type Answer, type Harness } from '../test/harness'
import { loadViewerAssets, type ViewerAssets } from '../viewer/viewerAssets'
import { VIEWER_PAGE_PATH } from '../viewer/viewerRoute'

let dir: string
let assets: ViewerAssets
let relay: Harness

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'relay-viewer-'))
  writeFileSync(join(dir, 'viewer.js'), 'console.log("viewer")')
  writeFileSync(join(dir, 'viewer.css'), 'body{}')
  writeFileSync(join(dir, 'pdf.worker.mjs'), 'self.onmessage = () => {}')
  mkdirSync(join(dir, 'wasm'))
  writeFileSync(join(dir, 'wasm', 'openjpeg.wasm'), Buffer.from([0, 97, 115, 109]))
  mkdirSync(join(dir, 'standard_fonts'))
  writeFileSync(join(dir, 'standard_fonts', 'FoxitSerif.pfb'), 'font')
  writeFileSync(join(dir, 'standard_fonts', 'LICENSE_FOXIT'), 'licence, not served')
  writeFileSync(join(tmpdir(), 'relay-viewer-secret.txt'), 'secret')
  symlinkSync(join(tmpdir(), 'relay-viewer-secret.txt'), join(dir, 'linked.js'))
  assets = loadViewerAssets(dir)!
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(join(tmpdir(), 'relay-viewer-secret.txt'), { force: true })
})
afterEach(async () => { await relay?.close() })

const policy = (a: Answer) => String(a.headers['content-security-policy'])
const directive = (a: Answer, name: string) => policy(a).split(/;\s*/).find(d => d === name || d.startsWith(`${name} `))

describe('the PDF viewer page on the files host @SC-1486 @SC-1568', () => {
  it('is served with its own policy: scripts from its own origin only, framed only by HQ', async () => {
    relay = await startRelay({ viewer: assets })
    const a = await ask(relay.port, VIEWER_PAGE_PATH)
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(directive(a, 'default-src')).toBe("default-src 'none'")
    expect(directive(a, 'script-src')).toBe("script-src 'self'")
    expect(directive(a, 'worker-src')).toBe("worker-src 'self'")
    expect(directive(a, 'connect-src')).toBe("connect-src 'self'")
    expect(directive(a, 'frame-ancestors')).toBe(`frame-ancestors ${APP_ORIGIN}`)
    expect(directive(a, 'base-uri')).toBe("base-uri 'none'")
    expect(directive(a, 'form-action')).toBe("form-action 'none'")
    expect(directive(a, 'sandbox')).toBe('sandbox allow-scripts allow-same-origin')
    expect(policy(a)).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe-eval|\*/)
    expect(a.headers['x-content-type-options']).toBe('nosniff')
    expect(a.headers['referrer-policy']).toBe('no-referrer')
    expect(a.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('names HQ as the one origin it reports to, and loads only its own script and style', async () => {
    relay = await startRelay({ viewer: assets })
    const html = (await ask(relay.port, VIEWER_PAGE_PATH)).body.toString()
    expect(html).toContain(`<meta name="report-to-origin" content="${APP_ORIGIN}">`)
    expect(html).toContain('<script type="module" src="/viewer/pdf/viewer.js"></script>')
    expect(html).toContain('<link rel="stylesheet" href="/viewer/pdf/viewer.css">')
    // No inline script: the policy would refuse it anyway.
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it('is not served on HQ’s own host, nor on any other host', async () => {
    relay = await startRelay({ viewer: assets })
    for (const host of [APP_HOST, 'localhost:4100', 'files.example.com.evil.org', 'evil.org']) {
      const a = await ask(relay.port, VIEWER_PAGE_PATH, { host })
      expect(a.status).toBe(404)
      expect(policy(a)).toBe('sandbox')
    }
    expect((await ask(relay.port, '/viewer/pdf/viewer.js', { host: APP_HOST })).status).toBe(404)
  })

  it('is not served when the relay knows no HQ origin to be framed by', async () => {
    relay = await startRelay({ viewer: assets, appOrigin: null })
    expect((await ask(relay.port, VIEWER_PAGE_PATH)).status).toBe(404)
  })

  it('says so when the viewer was not built into this relay', async () => {
    relay = await startRelay({ viewer: null })
    const a = await ask(relay.port, VIEWER_PAGE_PATH)
    expect(a.status).toBe(404)
    expect(a.body.toString()).toMatch(/PDF viewer is not built into this relay/)
    expect(policy(a)).toBe('sandbox')
  })

  it('answers only GET and HEAD, and ignores a query string', async () => {
    relay = await startRelay({ viewer: assets })
    const post = await ask(relay.port, VIEWER_PAGE_PATH, { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.allow).toBe('GET, HEAD')
    const head = await ask(relay.port, VIEWER_PAGE_PATH, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.body.length).toBe(0)
    expect((await ask(relay.port, `${VIEWER_PAGE_PATH}?x=1`)).status).toBe(200)
  })

  it('drops any cookie: the files host holds no session', async () => {
    relay = await startRelay({ viewer: assets })
    const a = await ask(relay.port, VIEWER_PAGE_PATH, { headers: { Cookie: 'sessionId=abc' } })
    expect(a.headers['set-cookie']).toBeUndefined()
  })
})

describe('the viewer’s files @SC-1487', () => {
  it('serves its script, style, worker and pdf.js data with their types and its policy', async () => {
    relay = await startRelay({ viewer: assets })
    const js = await ask(relay.port, '/viewer/pdf/viewer.js')
    expect(js.status).toBe(200)
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(js.body.toString()).toBe('console.log("viewer")')
    expect(directive(js, 'script-src')).toBe("script-src 'self'")
    expect(js.headers['cross-origin-resource-policy']).toBe('same-origin')
    expect((await ask(relay.port, '/viewer/pdf/viewer.css')).headers['content-type']).toBe('text/css; charset=utf-8')
    expect((await ask(relay.port, '/viewer/pdf/wasm/openjpeg.wasm')).headers['content-type']).toBe('application/wasm')
    expect((await ask(relay.port, '/viewer/pdf/standard_fonts/FoxitSerif.pfb')).status).toBe(200)
  })

  it('gives the worker alone WebAssembly, for pdf.js’s image decoders, and still no eval', async () => {
    relay = await startRelay({ viewer: assets })
    const w = await ask(relay.port, '/viewer/pdf/pdf.worker.mjs')
    expect(w.status).toBe(200)
    expect(directive(w, 'script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
    expect(directive(w, 'default-src')).toBe("default-src 'none'")
    expect(policy(w)).not.toMatch(/'unsafe-eval'|unsafe-inline/)
  })

  it('serves nothing it was not built with: no path outside, no link, no file of unknown type', async () => {
    relay = await startRelay({ viewer: assets })
    for (const p of [
      '/viewer/pdf/linked.js', '/viewer/pdf/standard_fonts/LICENSE_FOXIT', '/viewer/pdf/../../package.json',
      '/viewer/pdf/%2e%2e/viewer.js', '/viewer/pdf//viewer.js', '/viewer/pdf/', '/viewer/pdf/nothing.js',
      '/viewer/pdf/pdf.sandbox.mjs', '/viewer/other',
    ]) {
      expect((await ask(relay.port, p)).status, p).toBe(404)
    }
  })

  it('answers 304 to a copy the browser already holds', async () => {
    relay = await startRelay({ viewer: assets })
    const first = await ask(relay.port, '/viewer/pdf/viewer.js')
    const etag = String(first.headers.etag)
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/)
    expect(first.headers['cache-control']).toBe('no-cache')
    const again = await ask(relay.port, '/viewer/pdf/viewer.js', { headers: { 'If-None-Match': etag } })
    expect(again.status).toBe(304)
    expect(again.body.length).toBe(0)
  })
})

describe('loading the viewer’s files @SC-1487', () => {
  it('is null when the folder is not there', () => {
    expect(loadViewerAssets(join(dir, 'missing'))).toBeNull()
  })
})
