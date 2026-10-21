/**
 * Agenthix Cloud in the Fleet Console (spec §7): the organisation's connection, each fleet admin's own Cloud sign-in,
 * Cloud's sites and fleet admins, remote access and the authenticator code.
 *
 * The organisation's connection is hq's (the connection protocol, core/src/cloud): connecting and disconnecting are
 * asked of hq over the console link, and hq decides who may — a fleet admin who is also an organisation admin — and
 * is the only one that talks to Cloud about it. The rest are scaffolds: a read answers the honest state, which is
 * that nothing is linked, on or set up; anything that would act, or read through Cloud, is checked and answered "not
 * connected" (409), and nothing else happens.
 *
 * The rule that is already here for when the feature is built: a session that came through the remote tunnel can
 * never turn remote access on or extend it, set up or renew the authenticator code, or connect or disconnect the
 * organisation, so it cannot keep itself open. Turning remote access off is anyone's. The tunnel marks every request
 * it forwards with `x-remote-tunnel` and removes the header from what a client sends; a client that sets the header
 * itself only gets itself refused, and signing in through it needs a code besides (remoteSignIn.ts).
 */
import { Router, type Request, type RequestHandler, type Response } from 'express'
import {
  AUTHENTICATOR_RECOVERY_CODE_COUNT, configuredCloudUrl, mayTurnOnRemoteAccess, parseCloudBaseUrl, parseCloudConnecting, parseHqCloudState, parseRemoteAccessDuration,
  type AuthenticatorView, type CloudView, type HqCloudState, type RemoteAccessOrigin, type RemoteAccessView, type SessionPlace,
} from '@agenthix/core'
import { HqCallError } from '../../hq/link'
import { remoteNameOf } from '../../net/remoteListener'
import type { ConsoleContext } from '../app'
import { actorOf } from './fleet'
import { cloudPlatformRoutes } from './cloudPlatform'
import { askNewerHq, notUnderstood } from './newerHq'

export const TUNNEL_HEADER = 'x-remote-tunnel'

const PATHS = ['/remote-access', '/authenticator', '/cloud']

/**
 * Where the request came from: the Fleet Console's own listener, unless it came through remote access — the tunnel
 * says so with its header, and the direct listener on a machine Cloud runs by its socket (net/remoteListener.ts).
 */
export function originOf(req: Request): RemoteAccessOrigin {
  return req.headers[TUNNEL_HEADER] === undefined && remoteNameOf(req.socket) === null ? 'localScreen' : 'tunnel'
}

export const placeOf = (req: Request): SessionPlace => originOf(req) === 'tunnel' ? 'throughRemoteAccess' : 'onTheMachine'

/** What every act that needs Cloud answers while nothing is connected: the state, not a stand-in. */
export const notConnected = (res: Response, extra: object = {}): void => {
  res.status(409).json({ error: 'not_connected', message: 'This organisation is not connected to Agenthix Cloud.', ...extra })
}

function refuseFromTunnel(req: Request, res: Response, what: string): boolean {
  if (mayTurnOnRemoteAccess(originOf(req))) return false
  res.status(403).json({ error: 'not_from_here', message: `${what} is done on the Fleet Console's own machine, never through remote access.` })
  return true
}

/** Where Cloud is, for the links out: `CLOUD_URL`, or Cloud's own address; null when it is not a usable one. */
function cloudOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  return parseCloudBaseUrl(configuredCloudUrl(env))?.origin ?? null
}

const NOTHING: HqCloudState = { connection: null, connecting: null, lastAttempt: null, runByCloud: false, problem: null }

/** hq's connection to Cloud; an hq older than the connection has none, which is what it would say. */
async function hqCloudState(ctx: ConsoleContext, res: Response): Promise<HqCloudState | null> {
  try {
    return parseHqCloudState(await ctx.link.call('cloud.state', { byUserId: actorOf(res).userId }))
  } catch (err) {
    if (err instanceof HqCallError && err.code === 'unknown_method') return NOTHING
    throw err
  }
}

/** Mounted before the other routes; `authed` is the session check the others use. */
export function cloudRoutes(ctx: ConsoleContext, authed: RequestHandler): Router {
  const r = Router()
  r.use(PATHS, authed)
  r.use(cloudPlatformRoutes(ctx))

  r.get('/remote-access', (req, res) => {
    const view: RemoteAccessView = { state: { on: false }, organisationConnected: false, place: placeOf(req) }
    res.json(view)
  })

  r.post('/remote-access', (req, res) => {
    if (refuseFromTunnel(req, res, 'Turning remote access on or extending it')) return
    const minutes = (req.body as Record<string, unknown> | undefined)?.forMinutes
    if (minutes !== undefined && (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1)) {
      res.status(400).json({ error: 'malformed', message: 'Say how long in whole minutes, or leave it out for 2 hours.' })
      return
    }
    const length = parseRemoteAccessDuration(minutes === undefined ? undefined : `${Math.floor(minutes / 60)}h${minutes % 60}m`)
    if (!length.ok) {
      res.status(400).json({ error: 'malformed', message: length.message })
      return
    }
    notConnected(res)
  })

  r.delete('/remote-access', (_req, res) => notConnected(res))

  r.get('/authenticator', (req, res) => {
    const view: AuthenticatorView = { code: null, place: placeOf(req) }
    res.json(view)
  })

  r.post('/authenticator', (req, res) => {
    if (!refuseFromTunnel(req, res, 'Setting up the authenticator code')) notConnected(res, { recoveryCodeCount: AUTHENTICATOR_RECOVERY_CODE_COUNT })
  })

  // The six digits the app shows, which confirm the code and give the recovery codes once.
  r.post('/authenticator/check', (req, res) => {
    if (!refuseFromTunnel(req, res, 'Setting up the authenticator code')) notConnected(res, { recoveryCodeCount: AUTHENTICATOR_RECOVERY_CODE_COUNT })
  })

  r.post('/authenticator/recovery-codes', (req, res) => {
    if (!refuseFromTunnel(req, res, 'Making new recovery codes')) notConnected(res, { recoveryCodeCount: AUTHENTICATOR_RECOVERY_CODE_COUNT })
  })

  r.get('/cloud', async (req, res) => {
    const state = await hqCloudState(ctx, res)
    if (!state) return notUnderstood(res)
    const view: CloudView = {
      organisation: state.connection, account: null, place: placeOf(req), connecting: state.connecting, lastAttempt: state.lastAttempt,
      cloudUrl: cloudOrigin(), runByCloud: state.runByCloud, problem: state.problem ?? null,
    }
    res.json(view)
  })

  // The organisation's connection: made and removed only on the Fleet Console's machine. hq asks Cloud for it and
  // answers the code the admin checks on Cloud's page; the screen then reads `GET /cloud` until it is approved.
  r.post('/cloud/organisation', async (req, res) => {
    if (refuseFromTunnel(req, res, 'Connecting the organisation to Agenthix Cloud')) return
    const answer = await askNewerHq(res, () => ctx.link.call('cloud.connect', { byUserId: actorOf(res).userId }))
    if (answer === undefined) return
    const connecting = parseCloudConnecting(answer.connecting)
    if (!connecting) return notUnderstood(res)
    res.json({ connecting })
  })
  r.delete('/cloud/organisation', async (req, res) => {
    if (refuseFromTunnel(req, res, 'Disconnecting the organisation from Agenthix Cloud')) return
    const answer = await askNewerHq(res, () => ctx.link.call('cloud.disconnect', { byUserId: actorOf(res).userId }))
    if (answer === undefined) return
    if (!answer.disconnected) return notConnected(res)
    res.json({ disconnected: true })
  })

  // The person's own Cloud sign-in (C6): signing in, signing out, and forgetting the linked account.
  r.post('/cloud/account/sign-in', (_req, res) => notConnected(res))
  r.delete('/cloud/account/sign-in', (_req, res) => notConnected(res))
  r.delete('/cloud/account', (_req, res) => notConnected(res))

  // Read through Cloud's API with the person's own sign-in, which nobody can have yet.
  r.get('/cloud/sites', (_req, res) => notConnected(res))
  r.get('/cloud/fleet-admins', (_req, res) => notConnected(res))

  return r
}
