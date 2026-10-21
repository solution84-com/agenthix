/**
 * The sign-in page's and Settings › Sign-in's way to signing in with an Agenthix account (cloudSignIn.ts). The
 * sign-in page is public, so what it reads says only whether the option works; it never carries a link to Cloud —
 * the page asks hq to start, and goes where hq answers.
 */
import type {
  CloudLinkApi, CloudSignInStatusApi, FinishCloudSignInApi, StartCloudSignInApi, UnlinkCloudAccountApi,
} from 'wasp/server/api'
import type { Response } from 'express'
import { consumeRateLimit } from '../server/rateLimit'
import { CloudSignInRefusal } from './cloudSignIn'
import { readOwnCloudLink, unlinkCloudAccount } from './cloudAccounts'
import { cloudSignIn } from '.'

/** Sign-ins started or finished from one address in a window: more than any person needs, few enough to stop a flood. */
const ATTEMPT_RULE = { max: 30, windowMs: 15 * 60 * 1000 }
const TOO_MANY = { error: 'Too many sign-in attempts from here. Try again in 15 minutes.', reason: 'rate_limited' }

const withinLimit = (ip: string | undefined) => consumeRateLimit(`cloud-sign-in:${ip ?? 'unknown'}`, ATTEMPT_RULE)

function refused(res: Response, err: unknown) {
  if (err instanceof CloudSignInRefusal) return res.status(err.status).json({ error: err.message, reason: err.code })
  throw err
}

export const cloudSignInStatusHandler: CloudSignInStatusApi = async (_req, res) => {
  res.json({ connected: await cloudSignIn().connected() })
}

/** `{ purpose: 'signIn' }` from the sign-in page, or `{ purpose: 'link', password }` from Settings › Sign-in. */
export const startCloudSignInHandler: StartCloudSignInApi = async (req, res, context) => {
  if (!(await withinLimit(req.ip))) return res.status(429).json(TOO_MANY)
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const started = body.purpose === 'link'
      ? await cloudSignIn().startLink(context.user?.id ?? null, body.password)
      : await cloudSignIn().startSignIn()
    return res.json(started)
  } catch (err) {
    return refused(res, err)
  }
}

/** The browser back from Cloud: `{ state, binding, code }`, or `{ state, binding, error }` when Cloud said no. */
export const finishCloudSignInHandler: FinishCloudSignInApi = async (req, res, context) => {
  if (!(await withinLimit(req.ip))) return res.status(429).json(TOO_MANY)
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    return res.json(await cloudSignIn().finish(
      { state: body.state, binding: body.binding, code: body.code, error: body.error },
      context.user?.id ?? null,
    ))
  } catch (err) {
    return refused(res, err)
  }
}

export const cloudLinkHandler: CloudLinkApi = async (_req, res, context) => {
  if (!context.user) return res.status(401).json({ error: 'Sign in first' })
  return res.json({ connected: await cloudSignIn().connected(), linked: await readOwnCloudLink(context.user.id) })
}

export const unlinkCloudAccountHandler: UnlinkCloudAccountApi = async (_req, res, context) => {
  if (!context.user) return res.status(401).json({ error: 'Sign in first' })
  return res.json({ unlinked: await unlinkCloudAccount(context.user.id) })
}
