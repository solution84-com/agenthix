// What the dispatch integration tests share: an install ready to dispatch (its site, signing key, platform
// package and an admin), agents with content, model keys for a boundary, and the dispatched payloads and their
// capability claims, read back off the siteRuntimeStore fake. Each test file sets SECRETS_MASTER_KEY before its
// imports and mocks `wasp/server` and the fake itself.
import { expect } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { PLATFORM_PACKAGE_KEY, SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole, ensureExecutionSite } from '../../test/factories'
import { ensureHqSigningKey } from '../../server/identity/signingKeyService'
import { writePackage } from '../../packages/packageStore'
import { writeAgentContent } from '../../packages/agentPackageService'
import { encryptSecret } from '../../server/crypto/secretCrypto'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

/** The install's own site, current protocol; its signing key; the platform package; and an admin. */
export async function readyToDispatch() {
  const site = await ensureExecutionSite({ protocolVersion: SITE_PROTOCOL_VERSION })
  await ensureHqSigningKey()
  await writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files: [{ path: 'PLATFORM.md', content: Buffer.from('platform') }], updatedById: null })
  const admin = await createUserWithRole('ADMIN')
  return { site, admin }
}

export async function agentWithContent(data: Record<string, unknown> = {}) {
  const agent = await createAgent(data)
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  return agent
}

/** An API key held by a project or a person. */
export function apiKeyFor(
  ownerType: 'project' | 'user',
  ownerId: string,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'openrouter' = 'anthropic',
) {
  return prisma.modelCredential.create({ data: { kind: 'API_KEY', provider, ownerType, ownerId, secret: encryptSecret(apiKey) } })
}

/** The one run dispatched since the last reset, with its site and the claims its capability carries. */
export function dispatched() {
  expect(siteStore.dispatchedRuns).toHaveLength(1)
  const [{ siteId, payload }] = siteStore.dispatchedRuns
  const claims = JSON.parse(Buffer.from(payload.capabilityJwt.split('.')[1], 'base64url').toString()) as CapabilityClaims
  return { siteId, payload, claims }
}
