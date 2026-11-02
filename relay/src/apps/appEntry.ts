/**
 * Entering a live app (live preview spec section 4, *The app*; section 6, *Apps and the relay*): hq's page sends a `POST` of the app ticket to
 * `APP_ENTRY_PATH` on the app's address (appRules.ts has already checked it came from hq's page). The relay verifies
 * the ticket as a site would — hq's signature, its life, this relay, its time to enter — with the site it names as the
 * audience, checks it is for the app this address is, takes it once, and sets the cookie the ticket names for no
 * longer than the ticket lives, its value only a random handle.
 *
 * A first entry answers a page that moves to `/` by itself: a navigation the app's own page makes, so the strict
 * cookie of a new tab goes with it, as it would not after a redirect from hq's page. A renewal answers nothing
 * (`204`): it is sent from a frame hq keeps out of sight, and the app's page carries on with the new cookie.
 *
 * Only a refused ticket hq really signed for this app is counted for the guard: one used already, cut off,
 * or entered in the wrong place. A missing or made-up ticket can come from anyone, and is refused without being counted.
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  APP_COOKIES, APP_ENTRY_FIELD, APP_TICKET_TOKEN_TYPE, readAppTicketSite, verifyRelayToken, type AppTicketClaims,
} from '@agenthix/core'
import { answerRelayRefusal, answerWords, frameAncestors } from './appAnswers'
import type { AppDoorDeps } from './appDeps'

/** A form with one ticket in it; anything longer is not hq's. */
export const MAX_ENTRY_BYTES = 16 * 1024

const HOP_SCRIPT = 'location.replace("/")'
const HOP_SCRIPT_HASH = createHash('sha256').update(HOP_SCRIPT).digest('base64')
const HOP_PAGE = '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Opening the app</title>'
  + `<script>${HOP_SCRIPT}</script><noscript><a href="/">Open the app</a></noscript>`

function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  return new Promise(resolve => {
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/x-www-form-urlencoded') {
      req.resume()
      return resolve(null)
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_ENTRY_BYTES) {
        req.destroy()
        return resolve(null)
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))))
    req.on('error', () => resolve(null))
  })
}

async function verifyEntry(ticket: string, deps: AppDoorDeps, relayId: string): Promise<AppTicketClaims | null> {
  const site = readAppTicketSite(ticket)
  if (!site) return null
  const verify = (keys: Awaited<ReturnType<AppDoorDeps['keys']['current']>>) => verifyRelayToken(ticket, {
    type: APP_TICKET_TOKEN_TYPE, keys, audience: site, relay: relayId, entering: true, nowMs: (deps.now ?? Date.now)(),
  })
  let verdict = await verify(await deps.keys.current())
  if (!verdict.ok && verdict.refusal === 'unknown-key') {
    const fresh = await deps.keys.refetch()
    if (fresh) verdict = await verify(fresh)
  }
  return verdict.ok ? verdict.claims : null
}

export async function enterApp(req: IncomingMessage, res: ServerResponse, appId: string, deps: AppDoorDeps): Promise<void> {
  const relayId = deps.relayId()
  if (!relayId) {
    req.resume()
    answerWords(res, 503, 'The relay is not connected to HQ yet. Try again in a moment. Nothing was changed.', deps.hqOrigin, { 'Retry-After': '5' })
    return
  }
  const form = await readForm(req)
  const ticket = form?.get(APP_ENTRY_FIELD)
  let claims: AppTicketClaims | null = null
  try {
    claims = ticket ? await verifyEntry(ticket, deps, relayId) : null
  } catch {
    answerWords(res, 503, "The relay could not fetch HQ's keys to check this entry. Try again in a moment. Nothing was changed.", deps.hqOrigin)
    return
  }
  if (!ticket || !claims || claims.appId !== appId) {
    answerRelayRefusal(res, 'ticket', deps.hqOrigin)
    return
  }
  // A frame's ticket enters a frame, a tab's a top-level page: a ticket for hq's viewer never sets a cookie anywhere else.
  const dest = String(req.headers['sec-fetch-dest'] ?? '').toLowerCase()
  const framed = dest === 'iframe' || dest === 'frame'
  if (framed !== (claims.cookie === 'frame')) {
    deps.refusals.count(appId, 'framing')
    answerRelayRefusal(res, 'framing', deps.hqOrigin)
    return
  }
  const taken = deps.jar.enter(ticket, claims)
  if ('refused' in taken) {
    deps.refusals.count(appId, taken.refused)
    answerRelayRefusal(res, taken.refused, deps.hqOrigin)
    return
  }
  const cookie = APP_COOKIES[claims.cookie]
  const seconds = Math.max(0, Math.floor((taken.entered.expiresAtMs - (deps.now ?? Date.now)()) / 1000))
  res.setHeader('Set-Cookie', `${cookie.name}=${taken.entered.handle}; ${cookie.attributes}; Max-Age=${seconds}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  if (claims.entry === 'renew') {
    res.setHeader('Content-Security-Policy', `default-src 'none'; ${frameAncestors(deps.hqOrigin)}`)
    res.writeHead(204)
    res.end()
    return
  }
  res.setHeader('Content-Security-Policy',
    `default-src 'none'; script-src 'sha256-${HOP_SCRIPT_HASH}'; base-uri 'none'; form-action 'none'; ${frameAncestors(deps.hqOrigin)}`)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.writeHead(200)
  res.end(HOP_PAGE)
}
