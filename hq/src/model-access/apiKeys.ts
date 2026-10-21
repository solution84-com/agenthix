/**
 * One owner's API key for one provider, read and decrypted: the organisation's from its `Provider` row
 * (providerService.ts), a project's or a person's from its `ModelCredential` row. Shared by a run's
 * credential (modelCredential.ts) and a conversation's access (conversations/access/), so both read a key
 * the same way. An OpenAI-compatible endpoint's key is its base URL and, if it needs one, a key; stored
 * without a key it reads as `apiKey: ''`. A key that does not decrypt reads as none.
 */
import { prisma } from 'wasp/server'
import type { ModelCredentialOwnerType } from '@prisma/client'
import type { CredentialProvider } from '@agenthix/core'
import { decryptStoredSecret } from '../server/crypto/secretCrypto'
import { getOrgModelKey } from '../server/providerService'

export type StoredApiKey = { provider: CredentialProvider; apiKey: string; baseUrl?: string }

export async function readApiKey(
  ownerType: ModelCredentialOwnerType,
  ownerId: string,
  provider: CredentialProvider,
): Promise<StoredApiKey | null> {
  if (ownerType === 'org') {
    const key = await getOrgModelKey(provider)
    return key ? { provider, ...key } : null
  }
  const row = await prisma.modelCredential.findUnique({
    where: { ownerType_ownerId_provider_kind: { ownerType, ownerId, provider, kind: 'API_KEY' } },
  })
  if (!row) return null
  if (provider === 'openai_compatible') {
    if (!row.baseUrl) return null
    if (row.secret === '') return { provider, apiKey: '', baseUrl: row.baseUrl }
    const apiKey = decryptStoredSecret(row.secret, 'model credential')
    return apiKey ? { provider, apiKey, baseUrl: row.baseUrl } : null
  }
  const apiKey = decryptStoredSecret(row.secret, 'model credential')
  return apiKey ? { provider, apiKey } : null
}
