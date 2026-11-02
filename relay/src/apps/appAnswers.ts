/**
 * The relay's own answers on a live app's address: its refusals, in words, and the headers every answer there carries.
 * An app's own answer keeps its headers; the relay adds only who may frame it (hq's page, or the app itself).
 */
import type { ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { APP_SERVE_REFUSALS, type AppServeRefusal, type RelayAppRefusal } from '@agenthix/core'

const RELAY_REFUSALS: Record<RelayAppRefusal, [number, string]> = {
  'cross-site': [403, 'This app answers only its own pages, so a request from another page was refused. Nothing was changed.'],
  'no-fetch-metadata': [403, "This browser didn't say where the request came from, so it was refused. Open the app from HQ in a current browser. Nothing was changed."],
  'websocket-origin': [403, "Only this app's own pages may open a connection to it. Nothing was changed."],
  navigation: [403, 'Open this app from HQ. Nothing was changed.'],
  'entry-origin': [403, "An app is entered only from HQ's page. Open it from HQ. Nothing was changed."],
  framing: [403, 'This way into the app does not fit how it was opened. Open it again from HQ. Nothing was changed.'],
  ticket: [403, "This way into the app was used already, or isn't valid. Open it again from HQ. Nothing was changed."],
  'no-cookie': [401, "This browser hasn't entered this app, or its entry ran out. Open it from HQ. Nothing was changed."],
  revoked: [403, 'This app is closed to you now. Open it again from HQ. Nothing was changed.'],
  'unknown-app': [404, 'No app answers at this address. Nothing was changed.'],
}

const SITE_REFUSALS: Record<AppServeRefusal, string> = {
  'ticket-invalid': 'The site running this app did not accept this entry. Open the app again from HQ.',
  'ticket-expired': "This app's entry ran out. Open it again from HQ.",
  'ticket-used': 'This entry was used already. Open the app again from HQ.',
  'preview-not-running': "This app's live preview isn't running. Start or resume it in HQ, then open the app again.",
  'app-starting': 'This app is starting. It reloads by itself in a moment.',
  'app-not-running': 'This app is not running. Ask the agent to start it, then open it again.',
  'app-unreachable': "Nothing answered on this app's port. Ask the agent to check it.",
  busy: 'The site running this app is busy. Try again in a moment.',
  failed: 'The site running this app could not answer.',
}

/** Who may frame anything on an app's address: hq's page, or the app's own. */
export function frameAncestors(hqOrigin: string | null): string {
  return `frame-ancestors 'self'${hqOrigin ? ` ${hqOrigin}` : ''}`
}

function setOwnHeaders(res: ServerResponse, hqOrigin: string | null): void {
  res.setHeader('Content-Security-Policy', `sandbox; default-src 'none'; ${frameAncestors(hqOrigin)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
}

export function answerWords(res: ServerResponse, status: number, text: string, hqOrigin: string | null, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  setOwnHeaders(res, hqOrigin)
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.writeHead(status)
  res.end(res.req?.method === 'HEAD' ? undefined : text)
}

export function answerRelayRefusal(res: ServerResponse, refusal: RelayAppRefusal, hqOrigin: string | null): void {
  const [status, text] = RELAY_REFUSALS[refusal]
  answerWords(res, status, text, hqOrigin)
}

export function answerSiteRefusal(res: ServerResponse, refusal: AppServeRefusal, hqOrigin: string | null): void {
  const retry: Record<string, string> = refusal === 'app-starting' || refusal === 'busy' ? { 'Retry-After': '2' } : {}
  answerWords(res, APP_SERVE_REFUSALS[refusal], SITE_REFUSALS[refusal], hqOrigin, retry)
}

const REASONS: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests',
  431: 'Request Header Fields Too Large', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
}

/** A WebSocket handshake refused: a plain HTTP answer before the socket closes. */
export function refuseSocket(socket: Duplex, status: number, text: string): void {
  if (!socket.writable) {
    socket.destroy()
    return
  }
  const body = Buffer.from(text)
  socket.end(
    `HTTP/1.1 ${status} ${REASONS[status] ?? 'Refused'}\r\nContent-Type: text/plain; charset=utf-8\r\n`
    + `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${text}`,
  )
}

export function refuseSocketForRelay(socket: Duplex, refusal: RelayAppRefusal): void {
  const [status, text] = RELAY_REFUSALS[refusal]
  refuseSocket(socket, status, text)
}

export function refuseSocketForSite(socket: Duplex, refusal: AppServeRefusal): void {
  refuseSocket(socket, APP_SERVE_REFUSALS[refusal], SITE_REFUSALS[refusal])
}
