/**
 * The relay (adr-0153): the fleet's one public door for files. Sites dial in and hold a line; browsers fetch
 * `/t/<ticket>` on the files address (or `/relay/t/<ticket>` on hq's own address where there is none); the relay
 * passes one to the other and decides nothing. hq's relay also serves hq's uploads from hq's storage folder, mounted
 * read-only, on tickets hq signed for it. It dials hq for its id and to report its load, and holds no database, no
 * file and no key of its own.
 */
import { fileURLToPath } from 'node:url'
import { ConfigError, loadConfig } from './config'
import { HqLink } from './hq/hqLink'
import { KeySet, fetchKeysFrom } from './keySet'
import { Load } from './load'
import { consoleLog } from './log'
import { SiteLines } from './lines/siteLines'
import { createRelay } from './relay'
import { openUploadFolder } from './uploads/uploadFolder'
import { loadViewerAssets } from './viewer/viewerAssets'

function main(): void {
  const config = loadConfig(process.env)
  const lines = new SiteLines()
  const load = new Load()
  // Without the folder the relay still carries every site's files; only uploads are refused, and it says so.
  const uploads = openUploadFolder(config.uploadsRoot ?? undefined)
  if (!uploads.ok) consoleLog(uploads.problem)
  // The build puts the PDF viewer beside the bundle (scripts/build.mjs).
  const viewer = loadViewerAssets(fileURLToPath(new URL('./viewer/pdf/', import.meta.url)))
  if (!viewer) consoleLog('the PDF viewer is not built into this relay: PDF preview is off, and PDFs can still be downloaded.')
  const link = new HqLink({ hqAddress: config.hqAddress, secret: config.secret, lines, load, log: consoleLog })
  const { server } = createRelay({
    keys: new KeySet(fetchKeysFrom(config.hqAddress)),
    relayId: () => link.relayId,
    filesHost: config.filesHost,
    appOrigin: config.appOrigin,
    log: consoleLog,
    lines,
    load,
    uploads: uploads.ok ? uploads.folder : null,
    viewer,
  })
  server.listen(config.port, config.listenHost, () => {
    consoleLog(`listening on ${config.listenHost}:${config.port}, ${config.filesHost
      ? `answering browsers on ${config.filesHost}`
      : 'answering no browser: there is no files address (set FILES_ORIGIN)'}`)
    link.start()
  })

  const stop = () => {
    link.stop()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

try {
  main()
} catch (err) {
  console.error(`[relay] ${err instanceof ConfigError || err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
