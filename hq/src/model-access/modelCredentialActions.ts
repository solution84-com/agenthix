/**
 * A boundary's model credential (spec §6.3, §6): the org's, a person's or a
 * project's, for one provider, each an API key or a subscription login. The
 * org's API keys are Provider rows, one per provider (providerService.ts);
 * every other credential is a ModelCredential row. `provider` defaults to
 * Anthropic. An OpenAI-compatible endpoint is a base URL and, only if the
 * endpoint needs one, a key; no other provider takes a base URL. One pair of operations
 * serves every settings surface, and which boundary a caller may touch is
 * gated in modelCredentialAccess.ts: the org's takes an admin, a project's
 * takes that project's admin, and a person may only manage their own.
 *
 * Only API keys are set here. A subscription is stored by signing in with
 * Claude (claudeLoginActions.ts), so the person always signs in themselves and
 * the file is read from the site, never pasted; this refuses one at every
 * boundary. Removing a subscription still goes through deleteModelCredential.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SetModelCredential, DeleteModelCredential } from 'wasp/server/operations'
import { encryptSecret } from '../server/crypto/secretCrypto'
import { requireSecretsKey } from '../server/crypto/requireSecretsKey'
import { deleteOrgModelKey, setOrgModelKey } from '../server/providerService'
import { checkBaseUrl, COMPATIBLE_ENDPOINT, type CredentialProvider } from '../shared/modelProviders'
import { providerArg, requireOwnerAccess, type CredentialKind, type ModelCredentialOwnerType } from './modelCredentialAccess'

type SetModelCredentialArgs = {
  ownerType: ModelCredentialOwnerType
  ownerId: string
  kind: CredentialKind
  provider?: CredentialProvider
  /** The API key. May be empty only for an OpenAI-compatible endpoint. */
  secret?: string
  /** An OpenAI-compatible endpoint's base URL; required for it, refused for every other provider. */
  baseUrl?: string
}

export const setModelCredential: SetModelCredential<SetModelCredentialArgs, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const { ownerType, ownerId, kind } = args
  const provider = providerArg(args.provider)
  if (kind === 'SUBSCRIPTION') throw new HttpError(400, 'Sign in with Claude to add a subscription')
  const secret = (args.secret ?? '').trim()

  let baseUrl: string | null = null
  if (provider === COMPATIBLE_ENDPOINT) {
    const checked = checkBaseUrl(args.baseUrl ?? '')
    if ('problem' in checked) throw new HttpError(400, checked.problem)
    baseUrl = checked.baseUrl
  } else {
    if (args.baseUrl) throw new HttpError(400, 'Only an OpenAI-compatible endpoint takes a base URL')
    if (!secret) throw new HttpError(400, 'A credential value is required')
  }

  await requireOwnerAccess(context, ownerType, ownerId, 'Setting a model credential')
  requireSecretsKey('Setting a model credential')

  if (ownerType === 'org') {
    await setOrgModelKey(provider, secret, baseUrl ?? undefined)
    return { ok: true }
  }

  // An endpoint with no key stores an empty secret: no key, rather than an
  // encrypted empty string, which would read back as a value in the clear.
  const stored = secret ? encryptSecret(secret) : ''
  const where = { ownerType_ownerId_provider_kind: { ownerType, ownerId, provider, kind } }
  await prisma.modelCredential.upsert({
    where,
    create: { ownerType, ownerId, provider, kind, secret: stored, baseUrl, expiresAt: null, termsAcceptedAt: null },
    update: { secret: stored, baseUrl, expiresAt: null, termsAcceptedAt: null },
  })
  return { ok: true }
}

type DeleteModelCredentialArgs = { ownerType: ModelCredentialOwnerType; ownerId: string; kind: CredentialKind; provider?: CredentialProvider }

export const deleteModelCredential: DeleteModelCredential<DeleteModelCredentialArgs, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const { ownerType, ownerId, kind } = args
  const provider = providerArg(args.provider)
  await requireOwnerAccess(context, ownerType, ownerId, 'Removing a model credential')
  if (ownerType === 'org' && kind === 'API_KEY') {
    await deleteOrgModelKey(provider)
    return { ok: true }
  }
  await prisma.modelCredential.deleteMany({ where: { ownerType, ownerId, provider, kind } })
  return { ok: true }
}
