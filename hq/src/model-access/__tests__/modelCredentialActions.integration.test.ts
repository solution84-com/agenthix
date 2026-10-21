/**
 * Setting and removing a model credential at each boundary (spec §6.3), against
 * the real test database: the org (admin), a project (its admin) or a person
 * (themselves only). API keys are set here; a subscription only arrives by
 * signing in with Claude (claudeLoginActions.ts), so setting one is refused.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { setModelCredential, deleteModelCredential } from '../modelCredentialActions'
import { decryptSecret } from '../../server/crypto/secretCrypto'
import { getOrgModelKey } from '../../server/providerService'

// The operations take Wasp's generated context type; these pass the one field they read.
const ctx = (user?: { id: string }) => ({ user }) as any
const subscriptionJson = JSON.stringify({ claudeAiOauth: { accessToken: 'a', expiresAt: 1_900_000_000_000 } })

let admin: { id: string }
let operator: { id: string }
let projectAdmin: { id: string }
let projectMember: { id: string }
let project: { id: string }

beforeEach(async () => {
  admin = await createUserWithRole('ADMIN')
  operator = await createUserWithRole('MEMBER')
  projectAdmin = await createUserWithRole('MEMBER')
  projectMember = await createUserWithRole('MEMBER')
  project = await createProject()
  await prisma.projectMember.createMany({
    data: [{ projectId: project.id, userId: projectAdmin.id, role: 'ADMIN' }, { projectId: project.id, userId: projectMember.id }],
  })
})
afterEach(() => vi.unstubAllEnvs())

const credentialRows = () => prisma.modelCredential.findMany()
const providerRows = () => prisma.provider.findMany()
function storedRow(ownerType: 'org' | 'project' | 'user', ownerId: string, provider = 'anthropic' as const) {
  return prisma.modelCredential.findUnique({
    where: { ownerType_ownerId_provider_kind: { ownerType, ownerId, provider, kind: 'API_KEY' } },
  })
}

describe('setModelCredential', () => {
  it.each(['org', 'user'] as const)('refuses with readable text and stores nothing when hq cannot store secrets (%s) (R-200)', async (ownerType) => {
    vi.stubEnv('SECRETS_MASTER_KEY', '')
    const ownerId = ownerType === 'org' ? 'org' : admin.id
    await expect(setModelCredential({ ownerType, ownerId, kind: 'API_KEY', secret: 'k' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('SECRETS_MASTER_KEY') })
    expect(await credentialRows()).toEqual([])
    expect(await providerRows()).toEqual([])
  })

  it('rejects an unauthenticated caller with 401', async () => {
    await expect(setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', secret: 'k' }, ctx()))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses a non-admin setting an org credential (403), storing nothing', async () => {
    await expect(setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', secret: 'k' }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await providerRows()).toEqual([])
  })

  it("an admin's org API key is stored, trimmed and encrypted, as the org's Provider row, not a ModelCredential row", async () => {
    await setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', secret: '  sk-ant-x  ' }, ctx(admin))
    expect(await getOrgModelKey('anthropic')).toEqual({ apiKey: 'sk-ant-x' })
    expect(JSON.stringify(await providerRows())).not.toContain('sk-ant-x')
    expect(await credentialRows()).toEqual([])
  })

  it("an org credential's ownerId must be 'org'", async () => {
    await expect(setModelCredential({ ownerType: 'org', ownerId: 'something-else', kind: 'API_KEY', secret: 'k' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await providerRows()).toEqual([])
  })

  it("a project admin's API key is stored on the project, encrypted, with no expiry or acceptance", async () => {
    await setModelCredential({ ownerType: 'project', ownerId: project.id, kind: 'API_KEY', secret: 'sk-ant-p' }, ctx(projectAdmin))
    const row = await storedRow('project', project.id)
    expect(row).toMatchObject({ expiresAt: null, termsAcceptedAt: null, baseUrl: null })
    expect(decryptSecret(row!.secret)).toBe('sk-ant-p')
  })

  it("replacing a key clears what the previous one had", async () => {
    await prisma.modelCredential.create({
      data: { ownerType: 'user', ownerId: admin.id, kind: 'API_KEY', secret: 'old', expiresAt: new Date(), termsAcceptedAt: new Date() },
    })
    await setModelCredential({ ownerType: 'user', ownerId: admin.id, kind: 'API_KEY', secret: 'new' }, ctx(admin))
    const row = await storedRow('user', admin.id)
    expect(row).toMatchObject({ expiresAt: null, termsAcceptedAt: null })
    expect(decryptSecret(row!.secret)).toBe('new')
  })

  it.each([
    ['a project member who is not its admin', () => projectMember],
    ['an org admin who is not on the project', () => admin],
  ])('%s cannot set a project API key (403)', async (_who, caller) => {
    await expect(setModelCredential({ ownerType: 'project', ownerId: project.id, kind: 'API_KEY', secret: 'k' }, ctx(caller())))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await credentialRows()).toEqual([])
  })

  it("a person cannot set another person's credential", async () => {
    await expect(setModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'API_KEY', secret: 'k' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await credentialRows()).toEqual([])
  })

  it('a person sets their own API key', async () => {
    await setModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'API_KEY', secret: 'sk-ant-u' }, ctx(operator))
    expect(decryptSecret((await storedRow('user', operator.id))!.secret)).toBe('sk-ant-u')
  })

  it.each(['org', 'project', 'user'] as const)('a %s subscription is refused (400): the only way in is signing in with Claude', async (ownerType) => {
    const ownerId = { org: 'org', project: project.id, user: admin.id }[ownerType]
    await expect(setModelCredential({ ownerType, ownerId, kind: 'SUBSCRIPTION', secret: subscriptionJson }, ctx(ownerType === 'project' ? projectAdmin : admin)))
      .rejects.toMatchObject({ statusCode: 400, message: 'Sign in with Claude to add a subscription' })
    expect(await credentialRows()).toEqual([])
    expect(await providerRows()).toEqual([])
  })

  it('an empty value is refused (400)', async () => {
    await expect(setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', secret: '   ' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await providerRows()).toEqual([])
  })
})

describe('deleteModelCredential', () => {
  beforeEach(async () => {
    await setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', secret: 'org-key' }, ctx(admin))
    await prisma.modelCredential.create({ data: { ownerType: 'org', ownerId: 'org', kind: 'SUBSCRIPTION', secret: 'x' } })
  })

  it('a non-admin cannot remove an org credential (403), and nothing is removed', async () => {
    await expect(deleteModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY' }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await getOrgModelKey('anthropic')).not.toBeNull()
  })

  it("removing the org API key deletes the org's Anthropic key and leaves its subscription", async () => {
    await deleteModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY' }, ctx(admin))
    expect(await getOrgModelKey('anthropic')).toBeNull()
    expect(await credentialRows()).toHaveLength(1)
  })

  it('removing the org subscription deletes its ModelCredential row and leaves the key', async () => {
    await deleteModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'SUBSCRIPTION' }, ctx(admin))
    expect(await credentialRows()).toEqual([])
    expect(await getOrgModelKey('anthropic')).not.toBeNull()
  })

  it("an org credential's ownerId must be 'org' (400)", async () => {
    await expect(deleteModelCredential({ ownerType: 'org', ownerId: 'x', kind: 'API_KEY' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it("a person cannot remove another person's credential", async () => {
    await prisma.modelCredential.create({ data: { ownerType: 'user', ownerId: operator.id, kind: 'SUBSCRIPTION', secret: 'x' } })
    await expect(deleteModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'SUBSCRIPTION' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.modelCredential.count({ where: { ownerId: operator.id } })).toBe(1)
  })

  it("a project's credential takes that project's admin", async () => {
    await prisma.modelCredential.create({ data: { ownerType: 'project', ownerId: project.id, kind: 'API_KEY', secret: 'x' } })
    await expect(deleteModelCredential({ ownerType: 'project', ownerId: project.id, kind: 'API_KEY' }, ctx(projectMember)))
      .rejects.toMatchObject({ statusCode: 403 })
    await deleteModelCredential({ ownerType: 'project', ownerId: project.id, kind: 'API_KEY' }, ctx(projectAdmin))
    expect(await storedRow('project', project.id)).toBeNull()
  })
})

describe('a key per provider (spec §6)', () => {
  it.each(['openrouter', 'openai', 'google'] as const)("stores the org's %s key under that provider", async (provider) => {
    await setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider, secret: 'k-1' }, ctx(admin))
    expect(await getOrgModelKey(provider)).toEqual({ apiKey: 'k-1' })
    expect(await getOrgModelKey('anthropic')).toBeNull()
  })

  it.each(['project', 'user'] as const)('stores a %s key on owner, provider and kind', async (ownerType) => {
    const [ownerId, caller] = ownerType === 'user' ? [operator.id, operator] : [project.id, projectAdmin]
    await setModelCredential({ ownerType, ownerId, kind: 'API_KEY', provider: 'openrouter', secret: 'sk-or-1' }, ctx(caller))
    const row = await prisma.modelCredential.findFirstOrThrow({ where: { ownerType, ownerId } })
    expect(row).toMatchObject({ provider: 'openrouter', kind: 'API_KEY', baseUrl: null })
    expect(decryptSecret(row.secret)).toBe('sk-or-1')
  })

  it.each([
    ['an unknown provider', { provider: 'mistral' as never, secret: 'k' }],
    ['a base URL for a provider that is not an endpoint', { provider: 'openai' as const, secret: 'k', baseUrl: 'https://x' }],
    ['a subscription for any provider', { provider: 'openai' as const, secret: 'k', kind: 'SUBSCRIPTION' as const }],
  ])('refuses %s (400), storing nothing', async (_what, args) => {
    await expect(setModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'API_KEY', ...args }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await credentialRows()).toEqual([])
  })

  it("removes only the named provider's key", async () => {
    for (const provider of ['google', 'openai'] as const) {
      await setModelCredential({ ownerType: 'user', ownerId: admin.id, kind: 'API_KEY', provider, secret: 'k' }, ctx(admin))
      await setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider, secret: 'k' }, ctx(admin))
    }
    await deleteModelCredential({ ownerType: 'user', ownerId: admin.id, kind: 'API_KEY', provider: 'google' }, ctx(admin))
    await deleteModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider: 'google' }, ctx(admin))
    expect((await credentialRows()).map((r) => r.provider)).toEqual(['openai'])
    expect(await getOrgModelKey('google')).toBeNull()
    expect(await getOrgModelKey('openai')).not.toBeNull()
  })
})

describe('an OpenAI-compatible endpoint', () => {
  const provider = 'openai_compatible' as const

  it("stores a person's base URL with no key as an empty secret", async () => {
    await setModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'API_KEY', provider, baseUrl: ' http://localhost:11434/v1 ' }, ctx(operator))
    expect(await prisma.modelCredential.findFirstOrThrow()).toMatchObject({ provider, secret: '', baseUrl: 'http://localhost:11434/v1' })
  })

  it('stores a key with it when given, encrypted', async () => {
    await setModelCredential({ ownerType: 'project', ownerId: project.id, kind: 'API_KEY', provider, baseUrl: 'https://llm.lan/v1', secret: 'lan-key' }, ctx(projectAdmin))
    const row = await prisma.modelCredential.findFirstOrThrow()
    expect(row.baseUrl).toBe('https://llm.lan/v1')
    expect(decryptSecret(row.secret)).toBe('lan-key')
  })

  it("stores the org's endpoint as its Provider row", async () => {
    await setModelCredential({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider, baseUrl: 'http://gpu:8000/v1' }, ctx(admin))
    expect(await getOrgModelKey(provider)).toEqual({ apiKey: '', baseUrl: 'http://gpu:8000/v1' })
  })

  it.each([
    ['no base URL', undefined],
    ['not a URL', 'localhost:11434'],
    ['another scheme', 'file:///etc/passwd'],
    ['a password in it', 'https://me:secret@llm.lan/v1'],
  ])('refuses %s (400), storing nothing', async (_what, baseUrl) => {
    await expect(setModelCredential({ ownerType: 'user', ownerId: operator.id, kind: 'API_KEY', provider, baseUrl }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await credentialRows()).toEqual([])
  })
})

describe("a personal project's credential (agents own schedule spec §4)", () => {
  it("is refused to its own admin — its runs use its person's own credentials", async () => {
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: owner.id, role: 'ADMIN' } })
    await expect(setModelCredential({ ownerType: 'project', ownerId: personal.id, kind: 'API_KEY', secret: 'sk-x' }, ctx(owner)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await credentialRows()).toEqual([])
  })
})
