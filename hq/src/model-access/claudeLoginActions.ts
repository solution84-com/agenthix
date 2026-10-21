/**
 * Adding a Claude subscription by signing in (spec §6.3): start a login on the
 * site and return the sign-in link, finish it with the code the person pasted
 * and store the credential, or cancel it. All three act for a boundary — the
 * org, a project or the person — and run the same gate the API-key actions do
 * (modelCredentialAccess.ts). hq never sees a password: only the link, which
 * goes to the person, and the code, which comes back.
 *
 * The one route to a stored subscription. `setModelCredential` refuses one.
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
import { requireOwnerAccess, type ModelCredentialOwnerType } from './modelCredentialAccess'

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

type StartArgs = { ownerType: ModelCredentialOwnerType; ownerId: string; termsAccepted: boolean }

export const startClaudeLogin: StartClaudeLogin<StartArgs, { loginId: string; url: string }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const { ownerType, ownerId } = args
  if (args.termsAccepted !== true) {
    throw new HttpError(400, "Accepting that a subscription covers one person's own use of Claude is required")
  }
  await requireOwnerAccess(context, ownerType, ownerId, WHAT)
  requireSecretsKey(WHAT)
  try {
    return await beginLogin({ ownerType, ownerId }, context.user.id)
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
  await requireOwnerAccess(context, owner.ownerType, owner.ownerId, WHAT)
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
    await prisma.modelCredential.upsert({
      where: { ownerType_ownerId_provider_kind: { ownerType: owner.ownerType, ownerId: owner.ownerId, provider: 'anthropic', kind: 'SUBSCRIPTION' } },
      create: { ownerType: owner.ownerType, ownerId: owner.ownerId, provider: 'anthropic', kind: 'SUBSCRIPTION', ...data },
      update: data,
    })
    return { ok: true }
  } catch (err) {
    return asHttp(err)
  }
}

export const cancelClaudeLogin: CancelClaudeLogin<{ loginId: string }, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const owner = peekLoginOwner(args.loginId, context.user.id)
  if (!owner) return { ok: true }
  await requireOwnerAccess(context, owner.ownerType, owner.ownerId, WHAT)
  try {
    await abandonLogin(args.loginId, context.user.id)
    return { ok: true }
  } catch (err) {
    return asHttp(err)
  }
}
