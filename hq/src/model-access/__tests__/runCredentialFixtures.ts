/**
 * Shared set-up for the run-credential tests (runCredential*.integration.test.ts):
 * stored credentials by boundary, the org's keys, and the number of people.
 * A credential's owner id is a plain string with no relation, so 'u1' and 'p1'
 * stand for a person and a project without rows of their own.
 */
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import { setOrgModelKey } from '../../server/providerService'
import type { CredentialProvider } from '../../shared/modelProviders'

export const SDK = 'claude-sdk'
export const OPENCODE = 'opencode'
export const SDK_MODEL = 'claude-sonnet-4-6'
export const OC_ANTHROPIC = 'anthropic/claude-sonnet-4-6'

type Owner = 'org' | 'project' | 'user'

/** An API key, encrypted unless `plain`; an OpenAI-compatible endpoint's may be empty and carries a base URL. */
export function storeKey(ownerType: Owner, ownerId: string, secret: string, opts: { provider?: CredentialProvider; baseUrl?: string | null; plain?: boolean } = {}) {
  return prisma.modelCredential.create({
    data: {
      ownerType, ownerId, kind: 'API_KEY', provider: opts.provider ?? 'anthropic', baseUrl: opts.baseUrl ?? null,
      secret: secret === '' || opts.plain ? secret : encryptSecret(secret),
    },
  })
}

/** A subscription login, accepted unless `accepted: false`. */
export function storeSubscription(ownerType: Owner, ownerId: string, oauthJson = 'oauth-json', opts: { accepted?: boolean; plain?: boolean } = {}) {
  return prisma.modelCredential.create({
    data: {
      ownerType, ownerId, kind: 'SUBSCRIPTION',
      secret: opts.plain ? oauthJson : encryptSecret(oauthJson),
      termsAcceptedAt: opts.accepted === false ? null : new Date(),
    },
  })
}

export async function orgKey(provider: CredentialProvider, apiKey: string, baseUrl?: string) {
  await setOrgModelKey(provider, apiKey, baseUrl)
}

/** Brings the organisation to `n` people. */
export async function peopleInOrg(n: number) {
  for (let have = await prisma.user.count(); have < n; have++) await createUser()
}
