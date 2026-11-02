/**
 * The Fleet Console's API (JSON, under `/api/`) and its screens (web.ts). Every route of the API but the status and
 * signing in needs a session; every request, the screens' included, passes the guards in guards.ts first.
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Activity } from '../activity'
import type { RoleCheck } from '../auth/roleCheck'
import type { Sessions } from '../auth/sessions'
import type { Authenticators } from '../auth/authenticators'
import type { RemoteAccess } from '../net/remoteAccess'
import type { SignIn } from '../auth/signIn'
import { HqCallError, HqUnavailableError, type HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import { HostCommandError } from '../hosts/commands'
import type { Presence } from '../hosts/presence'
import type { Silence } from '../hosts/silence'
import type { FiguresRefresh } from '../hosts/figuresRefresh'
import type { HqFacts } from '../hq/hqFacts'
import { JoinError, type Joins } from '../join/joins'
import type { HandoverIn } from '../handover/incoming'
import type { HandoverOut } from '../handover/outgoing'
import type { PinnedHosts } from '../state/hosts'
import type { CommandRuns } from './commandRuns'
import { loopbackOnly, requireSession, sameOriginOnly, securityHeaders } from './guards'
import { HQ_NOT_ANSWERING } from '../auth/signIn'
import { sessionRoutes } from './routes/session'
import { fleetRoutes } from './routes/fleet'
import { joinRoutes } from './routes/joins'
import { commandRoutes } from './routes/commands'
import { backupRoutes } from './routes/backups'
import { fleetAdminRoutes } from './routes/fleetAdmins'
import { activityRoutes } from './routes/activity'
import { moveRoutes } from './routes/moves'
import { livePreviewRoutes } from './routes/livePreviews'
import { MoveError, type Moves } from '../move/moves'
import { cloudRoutes } from './routes/cloud'
import { remoteSignInRoutes } from './routes/remoteSignIn'
import { exportFileRoutes, exportRoutes } from './routes/exports'
import { ExportDownloads } from '../exports/downloads'
import { defaultWebRoot, webRoutes } from './web'

export type ConsoleContext = {
  link: HqLink
  hosts: PinnedHosts
  presence: Presence
  silence: Silence
  figures: FiguresRefresh
  hqFacts: HqFacts
  commands: HostCommands
  joins: Joins
  moves: Moves
  handoverOut: HandoverOut
  handoverIn: HandoverIn
  activity: Activity
  sessions: Sessions
  roles: RoleCheck
  signIn: SignIn
  runs: CommandRuns
  /** Remote access on a machine Cloud runs, and the authenticator codes a sign-in through it needs. */
  remoteAccess: RemoteAccess
  authenticators: Authenticators
  machineName: string
  consoleFingerprint: string
  version: string
}

export type AppOptions = {
  /** The built web app's directory; tests give a fixture. */
  webRoot?: string
}

export function createApp(ctx: ConsoleContext, options: AppOptions = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.use(securityHeaders, loopbackOnly, sameOriginOnly)
  app.use(express.json({ limit: '64kb', type: 'application/json' }))

  const authed = requireSession(ctx.sessions, ctx.roles)
  const downloads = new ExportDownloads(ctx.commands)
  // A download the browser fetches by itself, with a one-time link made behind the session (routes/exports.ts).
  app.use('/api', exportFileRoutes(ctx, downloads))
  // Before signing in: through remote access, a sign-in needs a code too.
  app.use('/api', remoteSignInRoutes(ctx))
  app.use('/api', sessionRoutes(ctx, authed))
  app.use('/api', cloudRoutes(ctx, authed))
  app.use('/api', authed, fleetRoutes(ctx), joinRoutes(ctx), commandRoutes(ctx), backupRoutes(ctx), fleetAdminRoutes(ctx), moveRoutes(ctx), activityRoutes(ctx), livePreviewRoutes(ctx), exportRoutes(ctx, downloads))
  app.use('/api', notFound)
  app.use(webRoutes(options.webRoot ?? defaultWebRoot()))
  app.use(notFound)
  app.use(errorHandler(ctx))
  return app
}

function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not_found', message: 'No such request.' })
}

/** An Express 5 route may throw or reject; the answer says what a person can act on, never a stack. */
function errorHandler(ctx: ConsoleContext) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof JoinError || err instanceof MoveError) {
      res.status(err.status).json({ error: err.status === 404 ? 'not_found' : 'conflict', message: err.message })
    } else if (err instanceof HqUnavailableError) {
      res.status(503).json({ error: 'hq_unreachable', message: HQ_NOT_ANSWERING(ctx.machineName) })
    } else if (err instanceof HqCallError) {
      const status = err.code === 'not_found' ? 404 : err.code === 'not_allowed' ? 403 : err.code === 'rate_limited' ? 429 : 502
      res.status(status).json({ error: err.code, message: err.message })
    } else if (err instanceof HostCommandError) {
      res.status(err.code === 'not_pinned' ? 404 : 502).json({ error: err.code, message: err.message })
    } else if (isBodyError(err)) {
      res.status(400).json({ error: 'malformed', message: 'The request is not valid JSON, or is too large.' })
    } else {
      console.error('[console] request failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'failed', message: 'Something went wrong in the Fleet Console. Try again.' })
    }
  }
}

function isBodyError(err: unknown): boolean {
  const type = (err as { type?: unknown } | null)?.type
  return type === 'entity.parse.failed' || type === 'entity.too.large'
}
