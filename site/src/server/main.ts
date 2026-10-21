// The site's entry point (ADR-0086): the routes in app.ts, then the site's own
// boot in setup.ts, then listen. Built to dist/server.js; `npm run dev` runs it
// from source.
import http from 'node:http'
import path from 'node:path'
import { prisma } from '#db'
import { createApp } from './app'
import { setupServer } from './setup'
import { hqConnectionManager } from './hq/hqConnection'
import { createShutdown, installShutdownSignals } from './shutdown'
import { Logger } from './utils/logger'
import { startLogFile } from './utils/logFile'
import { getSiteRoot } from '../agents/agentDiskPaths'

const logger = new Logger('server')

async function main(): Promise<void> {
  // This site's own log, kept under its data folder (adr-0106). Without SITE_ROOT the
  // boot below refuses to start, and says so on standard output.
  if (process.env.SITE_ROOT?.trim()) startLogFile(path.join(getSiteRoot(), 'logs'))
  const port = Number(process.env.PORT || 4201)
  const server = http.createServer(createApp())

  installShutdownSignals(createShutdown({
    server,
    stopHqLink: () => hqConnectionManager.stop(),
    disconnectDb: () => prisma.$disconnect(),
    exit: code => process.exit(code),
    log: line => logger.info(line),
  }))

  await setupServer()

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.syscall !== 'listen') throw err
    if (err.code === 'EACCES') logger.error(`Port ${port} requires elevated privileges`)
    else if (err.code === 'EADDRINUSE') logger.error(`Port ${port} is already in use`)
    else throw err
    process.exit(1)
  })
  server.listen(port, () => logger.info(`Listening on port ${port}`))
}

main().catch(err => {
  logger.error('The site could not start', err)
  process.exit(1)
})
