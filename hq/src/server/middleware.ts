/**
 * Global Middleware Configuration
 * ================================
 *
 * Registered as `server.middlewareConfigFn` in main.wasp.ts, this module customises
 * the Express middleware stack that runs on EVERY incoming HTTP request.
 *
 * ## What it configures
 *
 * 1. **Custom Request Logger** — Replaces Wasp's default `morgan`-style logger
 *    with a centralized `Logger` instance. This avoids duplicate log lines and
 *    gives us a single, consistent log format across the whole server.
 *
 * 2. **CORS** — Replaces Wasp's default CORS handler (which only allows
 *    `WASP_WEB_CLIENT_URL`) with one that also accepts the HQ origin so that
 *    brokered browser sessions can call site operations cross-origin.
 *
 * 2b. **The client protocol** — refuses an app whose version is too far from
 *    hq's (clientProtocol.ts).
 *
 * ## Middleware ordering
 *
 * Wasp stores middleware in an ordered Map. By using `.set()` with a known key,
 * we can replace existing entries (like the default logger) or append new ones.
 */
import cors from 'cors'
import express from 'express'
import { config } from 'wasp/server'
import { CLIENT_PROTOCOL_VERSION_HEADER } from '@agenthix/core'
import type { MiddlewareConfigFn } from 'wasp/server'
import { hqOrigin, loggablePath } from './hqOrigin'
import { Logger } from './utils/logger'
import { signInLimit } from '../auth/signInLimit'
import { readOnlyGuard } from './readOnly'
import { slidePhoneSessionGuard } from '../mobile/slideSession'
import { clientProtocolGuard, clientStatedOf, describeClient } from './clientProtocol'

const logger = new Logger('HTTP')

/**
 * Wasp reads every JSON body with Express's default limit (100 kB), far under a picture sent as a data URL or a skill
 * sent as its files. These operations get room for a 10 MB file as base64 (about 13.4 MB): the four image uploads and
 * a task attachment's; a package's preview, its files read first, and its install, which carry an uploaded ZIP or
 * folder (at most `PACKAGE_MAX_BYTES`, 8 MB, as base64); and a draft's save, which carries every file of the skill.
 * Every other route keeps the default.
 */
export const UPLOAD_BODY_LIMIT = '15mb'
export const LARGE_BODY_OPERATIONS = [
  'upload-org-image', 'upload-team-image', 'upload-agent-image', 'upload-person-picture', 'upload-task-attachment',
  'preview-asset-install', 'get-package-files', 'install-asset',
  'save-asset-draft', 'save-place-skill-draft',
] as const
const UPLOAD_PATH = new RegExp(`^/operations/(${LARGE_BODY_OPERATIONS.join('|')})/?$`)
const defaultJson = express.json()
const uploadJson = express.json({ limit: UPLOAD_BODY_LIMIT })
export const jsonBody: express.RequestHandler = (req, res, next) =>
  (UPLOAD_PATH.test(req.originalUrl.split('?')[0]) ? uploadJson : defaultJson)(req, res, next)

/**
 * The CORS rule every browser-facing route shares. The routes registered straight on Express in setup.ts (the
 * link to an uploaded file) sit outside Wasp's middleware, so they apply it themselves: without it the browser
 * refuses their responses and an agent's avatar and cover never show.
 */
export function hqCors() {
  return cors({
    origin: [...config.allowedCORSOrigins, hqOrigin()],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Site-Key', CLIENT_PROTOCOL_VERSION_HEADER],
    credentials: true,
  })
}

export const middlewareConfig: MiddlewareConfigFn = (middlewareConfig) => {
  // ── 1. Replace the default request logger ─────────────────────────
  // Wasp registers its own morgan-based logger under the key 'logger'.
  // We overwrite it with our own handler so every request flows through
  // a single logging system with timestamps and duration tracking.
  const timestampLogger = (req: any, res: any, next: any) => {
    const start = Date.now()
    res.on('finish', () => {
      const duration = Date.now() - start
      const contentLength = res.get('content-length') || '-'
      const client = describeClient(clientStatedOf(res))

      // Format: METHOD /path STATUS DURATIONms - BYTES[ · client VERSION USER-AGENT]
      // e.g.    GET /api/v1/agents 200 12ms - 342 · client 1.0 mobile/1.2.0
      logger.info(`${req.method} ${loggablePath(req.originalUrl)} ${res.statusCode} ${duration}ms - ${contentLength}${client ? ` · ${client}` : ''}`)
    })
    next()
  }

  middlewareConfig.set('logger', timestampLogger)

  // ── 2. CORS — allow both site frontend and HQ origin ──────────────
  // Wasp's default CORS handler only allows WASP_WEB_CLIENT_URL.  We
  // replace it so that Plan 2 brokered sessions (HQ browser → site API)
  // can reach Wasp operations cross-origin using a Bearer session token.
  // `credentials: false` — we rely on Authorization headers, not cookies.
  // Extend Wasp's allowedCORSOrigins (dev: /.*/, prod: frontendUrl) with HQ origin.
  // Using config.allowedCORSOrigins ensures we preserve Wasp's dev permissiveness
  // and prod-correct frontend URL, rather than hardcoding ports ourselves.
  middlewareConfig.set('cors', hqCors())

  // ── 2b. The client protocol: an app too far from hq's version gets a 426 ──
  // After CORS, so a refused browser-based client can still read the answer.
  middlewareConfig.set('clientProtocol', clientProtocolGuard)

  // ── 3. Sign-in attempts limited per address (getting-in spec) ─────
  // Acts only on Wasp's own login route; every other request passes through.
  middlewareConfig.set('signInLimit', signInLimit)

  // ── 4. JSON bodies: room for the upload actions only ──────────────
  middlewareConfig.set('express.json', jsonBody)

  // ── 5. Read-only while hq moves to a new machine (readOnly.ts) ────
  middlewareConfig.set('readOnly', readOnlyGuard)

  // ── 6. A phone's session slides forward with use (mobile/deviceSessions.ts) ──
  middlewareConfig.set('slidePhoneSession', slidePhoneSessionGuard)

  return middlewareConfig
}
