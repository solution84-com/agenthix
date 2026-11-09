/**
 * Reaching a resolved model (models from one place, part 1 and part 4): a provider only says where to send and what
 * to present. hq's own calls take the provider's key from the store (`hqCallAccess`); a run on a site is given a
 * provider descriptor for each provider it may use (`runModelAccess`), and the site's relay adds the key.
 *
 * A person's own Claude subscription goes only to a run in their own harness home, as a grant
 * (`sites/subscriptionGrants.ts`), so a token the harness refreshes comes back to hq. Agenthix Cloud is reached once
 * hq's calls to it are built; until then it is never a provider a call is sent to.
 */
import { prisma } from 'wasp/server'
import type { AiProviderVendor, CapabilityRunner, RunModelAccess, RunProviderDescriptor, Resolution } from '@agenthix/core'
import type { ModelProvider, ResolvedAccess } from '../conversations/contract'
import { decryptStoredSecret } from '../server/crypto/secretCrypto'
import { isOrgFeatureOn } from '../features/switches'
import { providerStore } from '../providers/store'
import { grantSubscription, type GrantTarget } from '../sites/subscriptionGrants'

const HQ_CALL_VENDORS: readonly AiProviderVendor[] = ['anthropic', 'openai', 'google', 'openrouter', 'openai_compatible', 'inworld']

/** Inworld is a vendor hq may call only while its language-model flag is on; the other vendors always. */
async function hqMayCall(vendor: AiProviderVendor): Promise<boolean> {
  if (!HQ_CALL_VENDORS.includes(vendor)) return false
  return vendor !== 'inworld' || isOrgFeatureOn('inworldLanguageModels')
}

/** The key and address for hq's own call on a resolved model; null when hq cannot call that provider itself. */
export async function hqCallAccess(r: Pick<Resolution, 'model' | 'vendor' | 'providerName'>): Promise<ResolvedAccess | null> {
  if (!(await hqMayCall(r.vendor))) return null
  const credential = await providerStore().credentialOf(r.model.providerId)
  if (!credential) return null
  return {
    providerId: r.model.providerId,
    providerName: r.providerName,
    provider: r.vendor as ModelProvider,
    model: r.model.model,
    apiKey: credential.key ?? '',
    ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
  }
}

/** Only the person whose own place the run is in, and who runs it in their own home, is handed their login. */
function runsAsOwner(runner: CapabilityRunner | undefined, ownerUserId: string): boolean {
  return runner?.kind === 'person' && runner.userId === ownerUserId
}

/**
 * A run's descriptor for one provider. A subscription needs where the run is going (`grantTo`), and is refused for a
 * run that does not run as its owner. Null for a provider a run cannot be given.
 */
export async function runProviderDescriptor(providerId: string, grantTo?: GrantTarget): Promise<RunProviderDescriptor | null> {
  const row = await prisma.aiProvider.findUnique({
    where: { id: providerId },
    select: { id: true, vendor: true, credentialKind: true, baseUrl: true, secret: true, ownerUserId: true, termsAcceptedAt: true },
  })
  if (!row) return null
  if (row.credentialKind === 'subscription') {
    if (!grantTo || !row.ownerUserId || !row.termsAcceptedAt || !row.secret || !runsAsOwner(grantTo.runner, row.ownerUserId)) return null
    const oauthJson = decryptStoredSecret(row.secret, 'Claude subscription')
    if (!oauthJson) return null
    const granted = await grantSubscription({ kind: 'subscription', provider: 'anthropic', oauthJson }, { providerId: row.id, signedInAt: row.termsAcceptedAt }, grantTo)
    return { kind: 'subscription', providerId: row.id, vendor: 'anthropic', oauthJson, grantId: granted.grantId, loginId: granted.loginId }
  }
  if (row.vendor === 'cloud' || row.ownerUserId !== null || !(await hqMayCall(row.vendor))) return null
  const credential = await providerStore().credentialOf(row.id)
  if (!credential) return null
  return {
    kind: 'api_key', providerId: row.id, vendor: row.vendor as Exclude<AiProviderVendor, 'cloud'>, apiKey: credential.key ?? '',
    ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
  }
}

/**
 * What a run is given to reach its models: the provider of its own model, and each other provider a helper of the run
 * may be sent to, once. Null when the run's own provider cannot be given to it.
 */
export async function runModelAccess(
  r: Pick<Resolution, 'model' | 'billingProfileId'>,
  others: readonly Pick<Resolution, 'model'>[],
  grantTo?: GrantTarget,
): Promise<RunModelAccess | null> {
  const provider = await runProviderDescriptor(r.model.providerId, grantTo)
  if (!provider) return null
  const seen = new Set([r.model.providerId])
  const rest: RunProviderDescriptor[] = []
  for (const o of others) {
    if (seen.has(o.model.providerId)) continue
    seen.add(o.model.providerId)
    const d = await runProviderDescriptor(o.model.providerId, grantTo)
    if (d) rest.push(d)
  }
  return {
    model: { providerId: r.model.providerId, model: r.model.model },
    provider,
    ...(rest.length > 0 ? { others: rest } : {}),
    billingProfileId: r.billingProfileId,
  }
}
