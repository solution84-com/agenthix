/**
 * The relay put together around its parts: one HTTP server that answers browsers' ticket requests and takes sites'
 * lines, and serves hq's uploads from hq's storage folder when it is given one; and, under the preview pattern, live
 * apps' requests and WebSockets (`apps/`). The tests give it a fake key source and no hq link.
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
import { RELAY_APP_STREAMS_PER_PERSON } from '@agenthix/core'
import { handleAppRequest, handleAppUpgrade } from './apps/appDoor'
import type { AppDoorDeps, HqAsk } from './apps/appDeps'
import { AppJar } from './apps/appJar'
import { AppRefusals } from './apps/appRefusals'

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
  /** Live apps' address pattern; null or absent: live apps are off. */
  previewPattern?: string | null
  /** hq's answer to whether an app ticket still stands; absent: none does. */
  ask?: HqAsk
  appLoad?: Load
  jar?: AppJar
  refusals?: AppRefusals
  appHeadTimeoutMs?: number
} & Pick<BrowserDeps, 'openTimeoutMs' | 'window' | 'creditStep'>

export type Relay = { server: Server; lines: SiteLines; load: Load; appLoad: Load; jar: AppJar; refusals: AppRefusals }

export function createRelay(parts: RelayParts): Relay {
  const lines = parts.lines ?? new SiteLines()
  const load = parts.load ?? new Load()
  const appLoad = parts.appLoad ?? new Load(RELAY_APP_STREAMS_PER_PERSON)
  const jar = parts.jar ?? new AppJar(parts.now)
  const refusals = parts.refusals ?? new AppRefusals()
  const apps: AppDoorDeps = {
    pattern: parts.previewPattern ?? null, hqOrigin: parts.appOrigin, lines, load: appLoad, jar, refusals,
    ask: parts.ask ?? (async () => false), keys: parts.keys, relayId: parts.relayId, now: parts.now,
    headTimeoutMs: parts.appHeadTimeoutMs, window: parts.window, creditStep: parts.creditStep,
  }
  const files = handleBrowserRequest({
    lines, load, filesHost: parts.filesHost, appOrigin: parts.appOrigin,
    openTimeoutMs: parts.openTimeoutMs, window: parts.window, creditStep: parts.creditStep,
    uploads: parts.uploads ?? null, keys: parts.keys, relayId: parts.relayId, now: parts.now,
    viewer: parts.viewer ?? null,
  })
  // A live app's address is answered by the apps' door alone: its cookies are the app's, never dropped as files' are.
  const server = createServer((req, res) => {
    if (!handleAppRequest(req, res, apps)) files(req, res)
  })
  attachSiteLines(server, {
    lines, keys: parts.keys, relayId: parts.relayId, log: parts.log, now: parts.now, pingIntervalMs: parts.pingIntervalMs,
    otherUpgrade: (req, socket, head) => handleAppUpgrade(req, socket, head, apps),
  })
  // A request's URL holds its ticket: Node's own client errors are answered without being logged.
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    else socket.destroy()
  })
  return { server, lines, load, appLoad, jar, refusals }
}
