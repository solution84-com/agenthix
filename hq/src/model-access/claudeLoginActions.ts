/**
 * A person's own Claude subscription, added by signing in (models from one place, part 4): start a login on the site
 * and return the sign-in link, finish it with the code the person pasted and store it, or cancel it. A subscription
 * belongs to one person and serves work in their own place only, so each person signs in for themselves: it is stored
 * as an `AiProvider` they own, never the organisation's. hq never sees a password: only the link, which goes to the
 * person, and the code, which comes back.
 */
import { HttpError, prisma } from 'wasp/server'
import type { StartClaudeLogin, CompleteClaudeLogin, CancelClaudeLogin } from 'wasp/server/operations'
import { encryptSecret } from '../server/crypto/secretCrypto'
import { requireSecretsKey } from '../server/crypto/requireSecretsKey'
import { ChannelRequestFailed } from '../sites/channel'
import {
  abandonLogin,
  beginLogin,
  ClaudeLoginRejectedError,
  ClaudeLoginUnknownError,
  completeLogin,
  oauthExpiresAt,
  peekLoginOwner,
} from '../sites/claudeLoginStore'
import { SiteUnreachableError } from '../storage/workspaceStore'

const WHAT = 'Signing in with Claude'
const NOT_OPEN = 'That sign-in is no longer open — start again'

/** One translation for every site-side outcome, so the person sees the site's own sentence. */
function asHttp(err: unknown): never {
  if (err instanceof HttpError) throw err
  if (err instanceof SiteUnreachableError) throw new HttpError(503, err.message)
  if (err instanceof ClaudeLoginUnknownError) throw new HttpError(404, err.message)
  if (err instanceof ClaudeLoginRejectedError) throw new HttpError(502, err.message)
  if (err instanceof ChannelRequestFailed) throw new HttpError(400, err.message)
  throw err
}

/** The person's own: the arguments that once named a boundary are kept, and only the caller is accepted. */
type StartArgs = { ownerType?: string; ownerId?: string; termsAccepted: boolean }

function requireOwn(context: { user?: { id: string } | null }, ownerType: string | undefined, ownerId: string | undefined): string {
  if (!context.user) throw new HttpError(401)
  if ((ownerType !== undefined && ownerType !== 'user') || (ownerId !== undefined && ownerId !== context.user.id)) {
    throw new HttpError(403, 'A Claude subscription is one person\'s own: sign in with your own')
  }
  return context.user.id
}

export const SUBSCRIPTION_NAME = 'Your Claude subscription'

export const startClaudeLogin: StartClaudeLogin<StartArgs, { loginId: string; url: string }> = async (args, context) => {
  const userId = requireOwn(context, args.ownerType, args.ownerId)
  if (args.termsAccepted !== true) {
    throw new HttpError(400, "Accepting that a subscription covers one person's own use of Claude is required")
  }
  requireSecretsKey(WHAT)
  try {
    return await beginLogin({ ownerType: 'user', ownerId: userId }, userId)
  } catch (err) {
    return asHttp(err)
  }
}

type CompleteArgs = { loginId: string; code: string }

export const completeClaudeLogin: CompleteClaudeLogin<CompleteArgs, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const code = args.code.trim()
  if (!code) throw new HttpError(400, 'The code from the sign-in page is required')
  const owner = peekLoginOwner(args.loginId, context.user.id)
  if (!owner) throw new HttpError(404, NOT_OPEN)
  const userId = requireOwn(context, owner.ownerType, owner.ownerId)
  // Before the code is spent: once the site has redeemed it, a failure to store the result loses it.
  requireSecretsKey(WHAT)
  try {
    const { oauthJson } = await completeLogin(args.loginId, context.user.id, code)
    const expiresAt = oauthExpiresAt(oauthJson)
    if (expiresAt === null) throw new ClaudeLoginRejectedError()
    const data = {
      secret: encryptSecret(oauthJson),
      expiresAt: new Date(expiresAt),
      termsAcceptedAt: new Date(),
    }
    const existing = await prisma.aiProvider.findFirst({ where: { ownerUserId: userId, vendor: 'anthropic' }, select: { id: true } })
    if (existing) await prisma.aiProvider.update({ where: { id: existing.id }, data: { ...data, state: 'works', stateSince: new Date(), stateDetail: null } })
    else {
      await prisma.aiProvider.create({
        data: { ...data, name: SUBSCRIPTION_NAME, vendor: 'anthropic', credentialKind: 'subscription', ownerUserId: userId },
      })
    }
    return { ok: true }
  } catch (err) {
    return asHttp(err)
  }
}

export const cancelClaudeLogin: CancelClaudeLogin<{ loginId: string }, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const owner = peekLoginOwner(args.loginId, context.user.id)
  if (!owner) return { ok: true }
  requireOwn(context, owner.ownerType, owner.ownerId)
  try {
    await abandonLogin(args.loginId, context.user.id)
    return { ok: true }
  } catch (err) {
    return asHttp(err)
  }
}
