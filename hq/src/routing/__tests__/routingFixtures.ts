/**
 * Providers, defaults and lists for integration tests of anything the resolver decides. Keys are obviously fake.
 */
import type { AiProviderState, AiProviderVendor, ModelListEntry, ModelListMode, ModelListOwner, ModelViaProvider } from '@agenthix/core'
import { prisma } from '../../test/db'
import { encryptSecret } from '../../server/crypto/secretCrypto'

export async function createProvider(opts: {
  vendor: AiProviderVendor
  name?: string
  state?: AiProviderState
  key?: string
  baseUrl?: string
}): Promise<{ id: string }> {
  return prisma.aiProvider.create({
    data: {
      name: opts.name ?? opts.vendor,
      vendor: opts.vendor,
      credentialKind: opts.vendor === 'cloud' ? 'none' : 'api_key',
      secret: opts.vendor === 'cloud' ? null : encryptSecret(opts.key ?? 'sk-test-fake'),
      keyHint: opts.vendor === 'cloud' ? null : 'fake',
      baseUrl: opts.baseUrl ?? null,
      state: opts.state ?? 'works',
    },
    select: { id: true },
  })
}

/** A person's own Claude subscription, signed in: an obviously fake credentials document. */
export async function createSubscription(userId: string): Promise<{ id: string }> {
  const oauth = JSON.stringify({ claudeAiOauth: { accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresAt: Date.now() + 3_600_000 } })
  return prisma.aiProvider.create({
    data: {
      name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', ownerUserId: userId,
      secret: encryptSecret(oauth), termsAcceptedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true },
  })
}

async function orgId(): Promise<string> {
  const org = (await prisma.org.findFirst({ select: { id: true } })) ?? (await prisma.org.create({ data: { name: 'Fernhill' }, select: { id: true } }))
  return org.id
}

export async function setOrgDefaults(d: { conversation?: ModelViaProvider; worker?: ModelViaProvider }): Promise<void> {
  await prisma.org.update({
    where: { id: await orgId() },
    data: {
      ...(d.conversation ? { defaultConversationProviderId: d.conversation.providerId, defaultConversationModel: d.conversation.model } : {}),
      ...(d.worker ? { defaultWorkerProviderId: d.worker.providerId, defaultWorkerModel: d.worker.model } : {}),
    },
  })
}

export async function setAgentChoices(agentId: string, d: { conversation?: ModelViaProvider; worker?: ModelViaProvider }): Promise<void> {
  const data = {
    ...(d.conversation ? { conversationProviderId: d.conversation.providerId, conversationModel: d.conversation.model } : {}),
    ...(d.worker ? { workerProviderId: d.worker.providerId, workerModel: d.worker.model } : {}),
  }
  await prisma.agentModelChoices.upsert({ where: { agentId }, create: { agentId, ...data }, update: data })
}

export async function setList(owner: ModelListOwner, ownerId: string | 'org', mode: ModelListMode, entries: ModelListEntry[]): Promise<void> {
  const id = ownerId === 'org' ? await orgId() : ownerId
  await prisma.modelList.create({ data: { owner, ownerId: id, mode, entries: { create: entries } } })
}
