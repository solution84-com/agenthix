// The site's HTTP routes (ADR-0086). Every route authenticates in its own
// handler, so none has route-level authentication; the site holds no identity
// store (ADR-0042) and serves no web page (ADR-0065). It listens on every
// interface because agent containers reach these endpoints over their own
// network (ADR-0066); nothing here registers or operates the site.
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { HARNESS_GATE_PATH, HARNESS_TURN_PATH } from '@agenthix/core'
import type { ApiHandler } from './http/apiHandler'
import { Logger } from './utils/logger'
import { healthHandler } from './health'
import { whoamiHandler } from './identity/identityApi'
import { mcpHandler } from './mcp/handler'
import { gitCredentialHandler } from './git/gitCredentialApi'
import { harnessTurnHandler } from './harness/turnApi'
import { harnessGateHandler } from './harness/harnessGateApi'
import { claudeKeyHandler } from './runtime/claudeKeyApi'
import { CLAUDE_KEY_PATH } from './runtime/claudeKeyTickets'
import { modelRelayHandler } from './modelRelay/modelRelayApi'
import { MODEL_RELAY_PATH } from './modelRelay/relayProviders'

type Route = {
  method: 'get' | 'post' | 'all'
  path: string
  handler: ApiHandler
  /** False only for the model relay, whose body is the provider's and streams through unread and uncapped. */
  parseBody: boolean
}

export const ROUTES: readonly Route[] = [
  // Liveness for process supervisors and the cross-app harness. Says nothing
  // about the site's identity or its link to hq — that is `agenthix-site status`.
  { method: 'get', path: '/health', handler: healthHandler, parseBody: true },
  // Verifies hq-issued tokens locally, with no per-request call to hq. The MCP
  // and git-credential endpoints below verify through the same code.
  { method: 'get', path: '/api/v1/identity/whoami', handler: whoamiHandler, parseBody: true },
  // A run's container reaches these two directly, validated in the handler
  // against a run token (runTokens.ts) resolved to a verified, audience-pinned
  // hq capability (identity/verifyHqToken.ts). The MCP transport reads the
  // parsed `req.body`.
  { method: 'post', path: '/mcp', handler: mcpHandler, parseBody: true },
  { method: 'post', path: '/api/v1/git/credential', handler: gitCredentialHandler, parseBody: true },
  // Agenthix's OpenCode plugin asks for a session's current turn here, checked
  // against the key the site gave that container's OpenCode server
  // (opencode/openCodeTurns.ts).
  { method: 'post', path: HARNESS_TURN_PATH, handler: harnessTurnHandler, parseBody: true },
  // The OpenCode plugin asks here before every tool call. The bearer is the
  // conversation's platform token (conversationTokens.ts), which names the turn
  // and resolves to nothing between turns.
  { method: 'post', path: HARNESS_GATE_PATH, handler: harnessGateHandler, parseBody: true },
  // What a claude process sends as its API key, traded once for the one-use
  // ticket in its environment by Claude Code's apiKeyHelper (claudeKeyTickets.ts).
  { method: 'post', path: CLAUDE_KEY_PATH, handler: claudeKeyHandler, parseBody: true },
  // The model relay: a harness sends every provider's model requests here and
  // the relay streams each to the provider with the turn's key added. Every
  // method, any path below the provider. It logs its own line per request.
  { method: 'all', path: `${MODEL_RELAY_PATH}/:provider{/*rest}`, handler: modelRelayHandler, parseBody: false },
]

const httpLogger = new Logger('http')

/** One line per request, path only: a query string could carry something that should not be logged. */
const accessLog: RequestHandler = (req, res, next) => {
  const started = performance.now()
  res.on('close', () => {
    const path = req.originalUrl.split('?')[0]
    httpLogger.info(`${req.method} ${path} ${res.statusCode} ${(performance.now() - started).toFixed(1)} ms`)
  })
  next()
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' })
}

/** A body parser's own errors (400, 413, 415) keep their status and message; anything else is a bare 500. */
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err)
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) httpLogger.error('Unhandled error in a route', err)
  res.status(status).json({ error: err?.expose ? String(err.message) : 'Internal server error' })
}

export function createApp(): express.Express {
  const app = express()
  app.disable('x-powered-by')
  // One parser of each kind, Express's defaults (JSON up to 100 kB), mounted per
  // route as Wasp mounted them. Never with app.use: a global parser would read
  // the relay's streamed body, silently.
  const ordinary: RequestHandler[] = [accessLog, express.json(), express.urlencoded()]
  for (const route of ROUTES) {
    app[route.method](route.path, ...(route.parseBody ? ordinary : []), route.handler)
  }
  app.use(notFound)
  app.use(errorHandler)
  return app
}
