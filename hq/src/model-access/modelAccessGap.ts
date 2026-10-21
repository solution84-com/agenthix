/**
 * Whether the org has no model credential of its own for runs to fall back on
 * (spec §6.3). A run uses its project's own, then its person's own, then the
 * org's (adr-0105), so with this gap a run whose project and person hold
 * nothing usable cannot start. Derived from the org's own credentials and the
 * number of people each time it is asked; nothing is stored, so the answer
 * cannot go stale.
 *
 * Missing means: no org API key for any provider (an OpenAI-compatible
 * endpoint counts, key or not), and either the org has several people (an
 * org subscription is then stored but not used) or has no subscription at all.
 * A person's or a project's own credential is not counted — it serves only
 * that person's or that project's runs, and the banner is about what the org
 * as a whole lacks.
 */
import { prisma } from 'wasp/server'
import { CREDENTIAL_PROVIDERS } from '../shared/modelProviders'
import { MODEL_KEY_SERVICE } from '../server/providerService'
import { countOrgPeople } from '../server/identity/orgPeople'
import { sharedSubscriptionAllowedForTesting } from './sharedSubscriptionSwitch'

export type ModelAccessGap = {
  missing: boolean
  reason: 'several-people' | 'no-credential' | null
}

export async function computeModelAccessGap(): Promise<ModelAccessGap> {
  const key = await prisma.provider.findFirst({
    where: { service: MODEL_KEY_SERVICE, name: { in: [...CREDENTIAL_PROVIDERS] } },
    select: { id: true },
  })
  if (key) return { missing: false, reason: null }

  const subscription = await prisma.modelCredential.findUnique({
    where: { ownerType_ownerId_provider_kind: { ownerType: 'org', ownerId: 'org', provider: 'anthropic', kind: 'SUBSCRIPTION' } },
    select: { id: true },
  })
  if (!subscription) return { missing: true, reason: 'no-credential' }

  return sharedSubscriptionAllowedForTesting() || (await countOrgPeople()) === 1
    ? { missing: false, reason: null }
    : { missing: true, reason: 'several-people' }
}
