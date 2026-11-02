/**
 * `app.serve` (live preview spec section 4, *Opening it*): a live app's request or WebSocket, on a relay's line. The
 * site trusts nothing the relay says. On every stream, before anything reaches the app:
 *
 *  1. The app ticket is verified with core's `verifyRelayToken` against hq's key set: hq's signature, its life, `aud`
 *     this site, `relay` the relay this line goes to.
 *  2. Its first stream redeems the site's own single-use ticket it carries (`siteTicket`), for exactly its live
 *     preview, person, app and entry; later streams of the same ticket are taken while it lives and its live preview
 *     runs.
 *  3. The live preview is running here, on the ticket's workspace.
 *  4. The stream goes only to that app's port in that live preview's container, through that live preview's one
 *     forwarder (`appStreams.ts`).
 *
 * A refusal is a head with a code. Nothing here logs a ticket, a path or a header.
 */
import {
  APP_TICKET_TOKEN_TYPE, appRefusalHead, isAppRequestHead, verifyRelayToken,
  type AppServeParams, type AppServeRefusal, type AppTicketClaims,
} from '@agenthix/core'
import type { ContentHandler } from '../../hq/content/contentMethods'
import type { KeySetSource } from '../../relay/hqKeySet'
import { Logger } from '../../utils/logger'
import { livePreviewRow, onLivePreviewChange } from '../livePreviewStore'
import { redeemTicket } from '../livePreviewTickets'
import { apps } from '../livePreviewRuntime'
import type { AppConnection } from './appConnect'
import { AppStreams, StreamsBusy } from './appStreams'
import { siteExecBegins } from '../livePreviewActivity'
import { spawnHelper } from '../container/exec'
import { endWith, proxyHttp, proxySocket } from './appProxy'

const logger = new Logger('appServe')

/** App streams this site carries at once, across every app: a dev server's page loads hundreds of modules. */
export const MAX_APP_STREAMS = 512
export const MAX_APP_ENTRIES = 2_000

export type AppServeOptions = {
  siteId: string
  relayId: string
  keys: KeySetSource
  now?: () => number
  connect?: (livePreviewId: string, port: number) => Promise<AppConnection>
}

type Entry = { livePreviewId: string; workspaceId: string; appId: string; person: string; expiresAtMs: number }

const entries = new Map<string, Entry>()
const redeemed = new Map<string, number>()
let open = 0

/** Every app stream goes through its live preview's forwarder (`appStreams.ts`). */
export const appStreams = new AppStreams({ spawn: spawnHelper, hold: (id, pid) => apps.holdRelay(id, pid), execBegins: siteExecBegins, now: Date.now,
})

onLivePreviewChange(row => {
  if (row.state.state === 'paused' || row.state.state === 'stopped') {
    forgetEntriesOf(row.id)
    appStreams.stop(row.id)
  }
})

export function forgetEntriesOf(livePreviewId: string | null): void {
  for (const [id, e] of entries) if (livePreviewId === null || e.livePreviewId === livePreviewId) entries.delete(id)
}

function readParams(params: unknown): AppServeParams | null {
  if (typeof params !== 'object' || params === null) return null
  const p = params as Record<string, unknown>
  if (typeof p.ticket !== 'string' || p.ticket.length > 16 * 1024 || !isAppRequestHead(p.request)) return null
  return { ticket: p.ticket, request: p.request }
}

async function verify(ticket: string, o: AppServeOptions): Promise<AppTicketClaims | AppServeRefusal> {
  const check = async () => verifyRelayToken(ticket, {
    type: APP_TICKET_TOKEN_TYPE, keys: await o.keys.get(), audience: o.siteId, relay: o.relayId, nowMs: (o.now ?? Date.now)(),
  })
  let verdict = await check()
  if (!verdict.ok && verdict.refusal === 'unknown-key' && (await o.keys.refresh())) verdict = await check()
  if (verdict.ok) return verdict.claims
  logger.warn(`app.serve refused a ticket: ${verdict.refusal}`)
  return verdict.refusal === 'expired' ? 'ticket-expired' : 'ticket-invalid'
}

/** Whether this verified ticket may carry a stream: let in before, or let in now by the site's own ticket. */
export function admit(claims: AppTicketClaims, now: number): { livePreviewId: string } | AppServeRefusal {
  for (const [id, e] of entries) if (e.expiresAtMs <= now) entries.delete(id)
  for (const [t, until] of redeemed) if (until <= now) redeemed.delete(t)
  const known = entries.get(claims.jti)
  if (known) {
    const same = known.livePreviewId === claims.livePreviewId && known.appId === claims.appId && known.person === claims.person
      && known.workspaceId === claims.workspaceId
    return same ? { livePreviewId: known.livePreviewId } : 'ticket-invalid'
  }
  if (redeemed.has(claims.siteTicket)) return 'ticket-used'
  const want = { livePreviewId: claims.livePreviewId, personId: claims.person, appId: claims.appId, entry: claims.entry }
  if (!redeemTicket(claims.siteTicket, want, now)) return 'ticket-invalid'
  redeemed.set(claims.siteTicket, claims.exp * 1000)
  while (entries.size >= MAX_APP_ENTRIES) entries.delete(entries.keys().next().value as string)
  entries.set(claims.jti, {
    livePreviewId: claims.livePreviewId, workspaceId: claims.workspaceId, appId: claims.appId, person: claims.person,
    expiresAtMs: claims.exp * 1000,
  })
  return { livePreviewId: claims.livePreviewId }
}

export function createAppServe(o: AppServeOptions): ContentHandler {
  return async (stream, params) => {
    const p = readParams(params)
    if (!p) return endWith(stream, appRefusalHead('ticket-invalid'))
    let claims: AppTicketClaims | AppServeRefusal
    try {
      claims = await verify(p.ticket, o)
    } catch (err) {
      logger.error(`app.serve could not verify a ticket: ${err instanceof Error ? err.message : 'unknown'}`)
      return endWith(stream, appRefusalHead('failed'))
    }
    if (typeof claims === 'string') return endWith(stream, appRefusalHead(claims))
    const row = await livePreviewRow(claims.livePreviewId)
    if (!row || row.workspaceId !== claims.workspaceId) return endWith(stream, appRefusalHead('ticket-invalid'))
    if (row.state.state !== 'running') return endWith(stream, appRefusalHead('preview-not-running'))
    const entry = admit(claims, (o.now ?? Date.now)())
    if (typeof entry === 'string') return endWith(stream, appRefusalHead(entry))
    const port = apps.portFor(row.id, claims.appId)
    if (port === null) return endWith(stream, appRefusalHead(apps.openable(row.id, claims.appId) ? 'app-starting' : 'app-not-running'))
    if (open >= MAX_APP_STREAMS) return endWith(stream, appRefusalHead('busy'))
    open++
    let release = () => {}
    try {
      const connection = await (o.connect ?? ((id, p) => appStreams.connect(id, p)))(row.id, port)
        .catch((err: unknown) => (err instanceof StreamsBusy ? 'busy' as const : null))
      if (connection === 'busy') return await endWith(stream, appRefusalHead('busy'))
      if (!connection) return await endWith(stream, appRefusalHead('app-unreachable'))
      void connection.pid.then(pid => { if (pid !== null) release = apps.holdRelay(row.id, pid) })
      const target = { port, connect: () => connection.socket }
      await (p.request.websocket ? proxySocket(stream, p.request, target) : proxyHttp(stream, p.request, target))
      connection.socket.destroy()
    } finally {
      release()
      open--
    }
  }
}
