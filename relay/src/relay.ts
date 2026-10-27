/**
 * The relay put together around its parts: one HTTP server that answers browsers' ticket requests and takes sites'
 * lines, and serves hq's uploads from hq's storage folder when it is given one. The tests give it a fake key source
 * and no hq link.
 */
import { createServer, type Server } from 'node:http'
import type { KeySet } from './keySet'
import { Load } from './load'
import type { Log } from './log'
import { attachSiteLines } from './lines/lineServer'
import { SiteLines } from './lines/siteLines'
import { handleBrowserRequest, type BrowserDeps } from './http/ticketRequest'
import type { UploadFolder } from './uploads/uploadFolder'
import type { ViewerAssets } from './viewer/viewerAssets'

export type RelayParts = {
  keys: KeySet
  relayId(): string | null
  filesHost: string | null
  appOrigin: string | null
  log: Log
  lines?: SiteLines
  load?: Load
  now?: () => number
  pingIntervalMs?: number
  /** hq's storage folder, mounted read-only, for the uploads hq's relay serves; null or absent: it serves none. */
  uploads?: UploadFolder | null
  /** The PDF viewer's files (`dist/viewer/pdf`); null or absent: the viewer page says it is not built in. */
  viewer?: ViewerAssets | null
} & Pick<BrowserDeps, 'openTimeoutMs' | 'window' | 'creditStep'>

export function createRelay(parts: RelayParts): { server: Server; lines: SiteLines; load: Load } {
  const lines = parts.lines ?? new SiteLines()
  const load = parts.load ?? new Load()
  const server = createServer(handleBrowserRequest({
    lines, load, filesHost: parts.filesHost, appOrigin: parts.appOrigin,
    openTimeoutMs: parts.openTimeoutMs, window: parts.window, creditStep: parts.creditStep,
    uploads: parts.uploads ?? null, keys: parts.keys, relayId: parts.relayId, now: parts.now,
    viewer: parts.viewer ?? null,
  }))
  attachSiteLines(server, {
    lines, keys: parts.keys, relayId: parts.relayId, log: parts.log, now: parts.now, pingIntervalMs: parts.pingIntervalMs,
  })
  // A request's URL holds its ticket: Node's own client errors are answered without being logged.
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    else socket.destroy()
  })
  return { server, lines, load }
}
