/**
 * What the Fleet Console recipes share. The Fleet Console's screens are static files (`console-web/dist`, built with
 * `npm run build` there) that its own server serves on `127.0.0.1:4300`. A recipe serves them itself: Playwright
 * answers every request to that address, the files from `dist/` and every `/api` request from the sample in
 * consoleSample.ts. So no Fleet Console, machine or hq has to run, and a screen shows the same thing each time.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, Route } from '@playwright/test'
import type { HostResults } from '@agenthix/core'
import { capture, type CaptureOptions } from './capture'
import {
  ACTIVITY, ARRIVED_JOIN, AUTHENTICATOR, CLOUD_VIEW, CONSOLE_ORIGIN, FLEET, FLEET_ADMINS, HOSTS, HQ_ADDRESS, NOTICES, livePreviewsOf, OPENED_JOIN, ORGANISATION, REMOTE_ACCESS, SAM, STATUS, nightsOf,
} from './consoleSample'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, '../../../console-web/dist')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
}

/** The token the screens keep in sessionStorage for the signed-in tab: a made-up value, which no server checks. */
const SAMPLE_CSRF_TOKEN = 'guide-sample-token'

export type ConsoleScreen = {
  /** Where the join stands when the Add a site screens ask: just opened (waiting) or a machine used the code (confirming). */
  join?: 'waiting' | 'confirming'
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** The Fleet Console's API for the sample organisation. A path it does not answer is a 404 and is named in the run's output. */
function answer(route: Route, pathname: string, search: string, screen: ConsoleScreen, unanswered: string[]): Promise<void> {
  const path = pathname.replace(/^\/api/, '')
  const method = route.request().method()
  const host = /^\/hosts\/([0-9a-f]{64})$/.exec(path)
  const nights = /^\/hosts\/([0-9a-f]{64})\/backups$/.exec(path)
  const livePreviews = /^\/sites\/([0-9a-f]{64})\/live-previews$/.exec(path)

  if (path === '/status') return json(route, STATUS)
  if (path === '/session' && method === 'GET') {
    return json(route, {
      user: SAM,
      account: { username: 'sam', organisationAdmin: true, since: FLEET_ADMINS[0].since },
      hq: { organisationName: ORGANISATION, address: HQ_ADDRESS },
    })
  }
  if (path === '/fleet') return json(route, FLEET)
  if (host) {
    const found = HOSTS.find(h => h.fingerprint === host[1])
    return found ? json(route, { host: found }) : json(route, { error: 'not_found', message: 'The Fleet Console does not know this machine.' }, 404)
  }
  if (nights) {
    const list: HostResults['backup.list'] = nightsOf(nights[1])
    return json(route, list)
  }
  if (livePreviews && method === 'GET') return json(route, { view: livePreviewsOf(livePreviews[1]) })
  if (path === '/notices') return json(route, { notices: NOTICES })
  if (path === '/fleet-admins') return json(route, { admins: FLEET_ADMINS })
  if (path === '/activity') return json(route, search.includes('after=') ? { entries: [], next: null } : ACTIVITY)
  if (path === '/joins' && method === 'POST') return json(route, OPENED_JOIN, 201)
  if (/^\/joins\/[^/]+$/.test(path) && method === 'GET') return json(route, screen.join === 'confirming' ? ARRIVED_JOIN : OPENED_JOIN)

  // Agenthix Cloud's parts: the organisation is not connected, so each read says so and nothing else is asked.
  if (method === 'GET' && path === '/cloud') return json(route, CLOUD_VIEW)
  if (method === 'GET' && path === '/remote-access') return json(route, REMOTE_ACCESS)
  if (method === 'GET' && path === '/authenticator') return json(route, AUTHENTICATOR)
  if (!/^\/(cloud|remote-access|authenticator|sign-in)/.test(path)) unanswered.push(`${method} ${path}`)
  return json(route, { error: 'not_found', message: 'Not part of the sample.' }, 404)
}

function serveFile(route: Route, pathname: string): Promise<void> {
  const requested = normalize(join(DIST, pathname === '/' ? 'index.html' : pathname))
  // A path without a file extension is a screen; the app answers it, as the server does.
  const file = requested.startsWith(DIST) && existsSync(requested) && statSync(requested).isFile()
    ? requested
    : extname(pathname) === '' ? join(DIST, 'index.html') : null
  if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' })
  return route.fulfill({ status: 200, contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
}

/** Serves the built screens and the sample API at the Fleet Console's address, signed in as Sam. */
async function serveConsole(page: Page, screen: ConsoleScreen): Promise<string[]> {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(`${DIST} is not built: run "npm run build" in console-web/ (the guide:screenshots script does)`)
  }
  const unanswered: string[] = []
  await page.addInitScript((token) => {
    try {
      sessionStorage.setItem('csrfToken', token)
    } catch {
      // Storage is blocked on a page that is not the Fleet Console's.
    }
  }, SAMPLE_CSRF_TOKEN)
  await page.route(`${CONSOLE_ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url())
    return url.pathname.startsWith('/api/') ? answer(route, url.pathname, url.search, screen, unanswered) : serveFile(route, decodeURIComponent(url.pathname))
  })
  return unanswered
}

export type ConsoleCaptureOptions = Omit<CaptureOptions, 'as' | 'path'> & ConsoleScreen & {
  /** Where to go, as the Fleet Console's address (`/sites/<fingerprint>`). */
  path: string
}

/**
 * Opens one Fleet Console screen, signed in as Sam, and saves its screenshot as `capture` does for hq. The server's
 * clock text is not blanked: nothing on these screens comes from a server clock, the sample follows the fixed date.
 */
export async function captureConsole(page: Page, { path, join, ...options }: ConsoleCaptureOptions): Promise<string> {
  const unanswered = await serveConsole(page, { join })
  const file = await capture(page, { ...options, as: null, path: `${CONSOLE_ORIGIN}${path}`, maskServerText: false })
  if (unanswered.length > 0) console.warn(`[console recipe] requests the sample does not answer: ${[...new Set(unanswered)].join(', ')}`)
  return file
}
