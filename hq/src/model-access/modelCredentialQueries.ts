/**
 * Whether a boundary's model credential is set, and whether a run can use it —
 * never the secret itself (spec §6.3). Same access split as the actions beside
 * it (modelCredentialAccess.ts): the org's takes an admin, a project's that
 * project's admin, a person's is their own. The org's API keys are Provider
 * rows, one per provider; whether one is there, and an OpenAI-compatible
 * endpoint's base URL, is all that is read of them. `provider` defaults to
 * Anthropic.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetModelCredentialStatus } from 'wasp/server/operations'
import { countOrgPeople } from '../server/identity/orgPeople'
import { sharedSubscriptionAllowedForTesting } from './sharedSubscriptionSwitch'
import { getOrgModelKeyStatus } from '../server/providerService'
import type { CredentialProvider } from '../shared/modelProviders'
import { providerArg, requireOwnerAccess, type CredentialKind, type ModelCredentialOwnerType } from './modelCredentialAccess'

type GetModelCredentialStatusArgs = { ownerType: ModelCredentialOwnerType; ownerId: string; kind: CredentialKind; provider?: CredentialProvider }

export type ModelCredentialStatus = {
  present: boolean
  expiresAt: string | null
  termsAcceptedAt: string | null
  /** Whether a run can use it now. False for a stored org or project
   *  subscription while the org has several people (spec §6.3), and for
   *  nothing stored. */
  usable: boolean
  /** An OpenAI-compatible endpoint's base URL; null for every other provider. */
  baseUrl: string | null
  /** False for an OpenAI-compatible endpoint stored without a key. */
  hasKey: boolean
}

const NONE: ModelCredentialStatus = { present: false, expiresAt: null, termsAcceptedAt: null, usable: false, baseUrl: null, hasKey: false }

export const getModelCredentialStatus: GetModelCredentialStatus<GetModelCredentialStatusArgs, ModelCredentialStatus> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const { ownerType, ownerId, kind } = args
  const provider = providerArg(args.provider)
  await requireOwnerAccess(context, ownerType, ownerId, 'Viewing a model credential')

  if (ownerType === 'org' && kind === 'API_KEY') {
    const org = await getOrgModelKeyStatus(provider)
    return org.present ? { ...NONE, present: true, usable: true, baseUrl: org.baseUrl, hasKey: org.hasKey } : NONE
  }

  const row = await prisma.modelCredential.findUnique({
    where: { ownerType_ownerId_provider_kind: { ownerType, ownerId, provider, kind } },
    select: { expiresAt: true, termsAcceptedAt: true, baseUrl: true, secret: true },
  })
  if (!row) return NONE
  const sharedSubscription = kind === 'SUBSCRIPTION' && ownerType !== 'user'
  return {
    present: true,
    baseUrl: row.baseUrl,
    hasKey: row.secret !== '',
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    termsAcceptedAt: row.termsAcceptedAt ? row.termsAcceptedAt.toISOString() : null,
    usable: sharedSubscription && !sharedSubscriptionAllowedForTesting() ? (await countOrgPeople()) === 1 : true,
  }
}
