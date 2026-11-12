/**
 * Every way a request, from a browser or from anything else, can reach hq's server, written down and reviewed.
 * hq answers machines and carries a relay's links, so a route nobody listed must not appear quietly.
 * This holds that by four checks, in the way the site's `runTokenSurface.test.ts` does for the site:
 *
 * 1. The HTTP routes declared to Wasp (`api(...)`) are the ones listed here, each with how it is authenticated.
 * 2. A route with no Wasp session names the credential it checks, and its handler's code mentions that check.
 *    A route that checks nothing is listed as public, with the reason.
 * 3. The routes registered directly on Express, beside the Wasp ones, are the ones listed here.
 * 4. The WebSocket upgrade handlers (the channels and links other parts dial in on) are the ones listed here.
 *
 * Adding a route fails the matching check until it is listed with its reviewed way of being authenticated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HQ = path.resolve(__dirname, '../../..')
const SRC = path.join(HQ, 'src')

type Declared = { method: string; path: string; auth: boolean; handler: string; file: string }

function waspFiles(): string[] {
  const found = [path.join(HQ, 'main.wasp.ts')]
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__') walk(full)
      } else if (entry.name.endsWith('.wasp.ts')) found.push(full)
    }
  }
  walk(SRC)
  return found
}

/** The module each imported name comes from, resolved to a file next to the declaring one. */
function importedFrom(text: string, file: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!m[2].startsWith('.')) continue
    const base = path.resolve(path.dirname(file), m[2])
    const found = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(c => fs.existsSync(c))
    if (!found) continue
    for (const part of m[1].split(',')) {
      const names = part.trim().split(/\s+as\s+/)
      if (names[0]) map.set(names[names.length - 1], found)
    }
  }
  return map
}

function declaredApis(): Declared[] {
  const out: Declared[] = []
  for (const file of waspFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const modules = importedFrom(text, file)
    for (const m of text.matchAll(/\bapi\(\s*"([A-Z]+)"\s*,\s*"([^"]+)"\s*,\s*(\w+)\s*,\s*\{([^}]*)\}/g)) {
      const auth = /\bauth:\s*(true|false)/.exec(m[4])
      out.push({
        method: m[1], path: m[2], auth: auth?.[1] === 'true', handler: m[3],
        file: modules.get(m[3]) ?? '',
      })
    }
  }
  return out
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|wasp)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** A route that carries a Wasp session (`auth: true`), or the credential an unauthenticated route checks itself. */
type Review = { session: true } | { checks: RegExp } | { public: string }

const API_ROUTES: Record<string, Review> = {
  'GET /.well-known/jwks.json': { public: 'the public keys other parts verify hq’s tokens with' },
  'GET /api/auth/bootstrap-status': { public: 'whether a first administrator is still to be made' },
  'GET /api/auth/cloud/link': { session: true },
  'GET /api/auth/cloud/status': { public: 'whether the cloud sign-in is offered, before anyone signs in' },
  'GET /api/org/public-identity': { public: 'what the organisation chose to show before sign-in' },
  'GET /api/v1/github/app-manifest-callback': { checks: /state/i },
  'GET /api/v1/github/app-manifest-new': { public: 'the form that starts registering the organisation’s GitHub App' },
  'GET /api/v1/usage/export': { session: true },
  'GET /health': { public: 'a liveness answer carrying no data' },
  'POST /api/auth/accept-invite': { session: true },
  'POST /api/auth/change-password': { session: true },
  'POST /api/auth/cloud/finish': { session: true },
  'POST /api/auth/cloud/start': { session: true },
  'POST /api/auth/cloud/unlink': { session: true },
  'POST /api/auth/password-reset': { session: true },
  'POST /api/auth/password-reset/read': { public: 'reads a reset link, which is its own proof' },
  'POST /api/auth/site-token': { session: true },
  'GET /api/demo/voice/:clip': { public: 'a recorded demo voice line: 404 unless DEMO_MODE is on, only a name the scripts\' loader accepts (demo/voice)' },
  'POST /api/demo/enter': { public: 'Enter the demo: 404 unless DEMO_MODE is on, then capped per address and overall (demo/enter)' },
  'POST /api/auth/validate-invite': { public: 'reads an invitation code, which is its own proof' },
  'POST /api/mobile/register-session': { session: true },
  'POST /api/v1/capabilities/renew': { checks: /authenticateSite/ },
  'POST /api/v1/cloud/ai-token': { checks: /authenticateSite/ },
  'POST /api/v1/data': { checks: /authenticateSite/ },
  'POST /api/v1/hosts/leave': { checks: /Bearer/ },
  'POST /api/v1/move-check': { checks: /credentialHash/ },
  'POST /api/v1/move-check/proof': { checks: /moveCheckDesk\.proof/ },
  'POST /api/v1/sites/leave': { checks: /authenticateSite/ },
  'POST /api/v1/sites/restore-renew': { checks: /credentialMatches/ },
  'POST /api/v1/usage/report': { checks: /authenticateSite/ },
  'POST /mcp': { checks: /authenticateConnection/ },
}

const EXPRESS_ROUTES = [
  'get /file-link',
  'options /file-link',
]

/** Each file that takes WebSocket upgrades, with the path it answers on. */
const UPGRADES: Record<string, string> = {
  'fleet/relay/consoleLinkServer.ts': 'HQ_CONSOLE_LINK_PATH',
  'fleet/relay/hostLinkServer.ts': 'HQ_HOST_LINK_PATH',
  'relays/relayLinkServer.ts': 'RELAY_HQ_LINK_PATH',
  'sites/channel/siteChannelServer.ts': 'HQ_SITE_CHANNEL_PATH',
  'sites/content/contentChannelServer.ts': 'HQ_SITE_CONTENT_PATH',
}

describe('hq’s route inventory', () => {
  const apis = declaredApis()
  const key = (d: Declared) => `${d.method} ${d.path}`

  it('finds the declarations it is meant to check', () => {
    expect(apis.length).toBeGreaterThan(20)
    for (const d of apis) expect(d.file, `handler ${d.handler} of ${key(d)} is imported`).not.toBe('')
  })

  it('has these Wasp API routes and no other; a new one has to be reviewed here', () => {
    expect(apis.map(key).sort()).toEqual(Object.keys(API_ROUTES).sort())
  })

  it('has the reviewed authentication for each: a session, a credential the handler checks, or a stated reason', () => {
    for (const d of apis) {
      const review = API_ROUTES[key(d)]
      if ('session' in review) {
        expect(d.auth, `${key(d)} is listed as carrying a session`).toBe(true)
      } else {
        expect(d.auth, `${key(d)} is listed as having none`).toBe(false)
        if ('checks' in review) {
          expect(fs.readFileSync(d.file, 'utf8'), `${key(d)}’s handler checks its credential`).toMatch(review.checks)
        } else {
          expect(review.public.length, `${key(d)} says why it is public`).toBeGreaterThan(10)
        }
      }
    }
  })

  it('has these routes registered directly on Express and no other @SC-2021', () => {
    const found = new Set<string>()
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\bapp\.(get|post|put|patch|delete|options|all|use)\(\s*'([^']+)'/g)) {
        found.add(`${m[1]} ${m[2]}`)
      }
    }
    expect([...found].sort()).toEqual([...EXPRESS_ROUTES].sort())
  })

  it('has these WebSocket upgrade handlers and no other', () => {
    const found: Record<string, string> = {}
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8')
      if (!/\.on\(\s*'upgrade'/.test(text)) continue
      const pathName = /(?:pathOf\(req\.url\)|\(req\.url \?\? ''\)\.split\('\?'\)\[0\])\s*!==\s*(\w+)/.exec(text)
      found[path.relative(SRC, file)] = pathName?.[1] ?? '?'
    }
    expect(found).toEqual(UPGRADES)
  })
})
