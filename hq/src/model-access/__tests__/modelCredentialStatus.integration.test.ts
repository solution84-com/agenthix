/**
 * Whether a boundary's credential is set, and whether a run can use it — never
 * the secret (spec §6.3) — against the real test database. Usable depends on
 * the number of people in the org, counted each time.
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

import { getModelCredentialStatus } from '../modelCredentialQueries'
import { setOrgModelKey } from '../../server/providerService'
import { encryptSecret } from '../../server/crypto/secretCrypto'

// The query takes Wasp's generated context type; these pass the one field it reads.
const ctx = (user?: { id: string }) => ({ user }) as any
const accepted = new Date('2026-09-01T00:00:00Z')
const expires = new Date('2030-01-01T00:00:00Z')
const NONE = { present: false, expiresAt: null, termsAcceptedAt: null, usable: false, baseUrl: null, hasKey: false }

let admin: { id: string }
let project: { id: string }

beforeEach(async () => {
  // The integration run takes hq's .env.server as its base, which may turn the development switch on.
  vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', '')
  admin = await createUserWithRole('ADMIN')
  project = await createProject()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })
})
afterEach(() => vi.unstubAllEnvs())

function store(ownerType: 'org' | 'project' | 'user', ownerId: string, kind: 'API_KEY' | 'SUBSCRIPTION', data: Record<string, unknown> = {}) {
  return prisma.modelCredential.create({
    data: { ownerType, ownerId, kind, secret: encryptSecret('the-secret'), expiresAt: expires, termsAcceptedAt: accepted, ...data },
  })
}
const status = (ownerType: 'org' | 'project' | 'user', ownerId: string, kind: 'API_KEY' | 'SUBSCRIPTION', caller = admin, provider?: 'openai_compatible') =>
  getModelCredentialStatus({ ownerType, ownerId, kind, ...(provider ? { provider } : {}) }, ctx(caller))

describe('getModelCredentialStatus', () => {
  it('401 when unauthenticated', async () => {
    await expect(getModelCredentialStatus({ ownerType: 'org', ownerId: 'org', kind: 'API_KEY' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('a non-admin cannot see the org status (403)', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(status('org', 'org', 'API_KEY', operator)).rejects.toMatchObject({ statusCode: 403 })
  })

  it("an org's ownerId must be 'org' (400)", async () => {
    await expect(status('org', 'x', 'API_KEY')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('the org API key is present when the org holds one, and the key is never read out', async () => {
    await setOrgModelKey('anthropic', 'sk-ant-org')
    const result = await status('org', 'org', 'API_KEY')
    expect(result).toEqual({ present: true, expiresAt: null, termsAcceptedAt: null, usable: true, baseUrl: null, hasKey: true })
    expect(JSON.stringify(result)).not.toContain('sk-ant-org')
  })

  it('the org API key is absent when the org holds none', async () => {
    expect(await status('org', 'org', 'API_KEY')).toEqual(NONE)
  })

  it('an API key is usable however many people the org has', async () => {
    await createUser()
    await createUser()
    await store('project', project.id, 'API_KEY', { expiresAt: null, termsAcceptedAt: null })
    expect((await status('project', project.id, 'API_KEY')).usable).toBe(true)
  })

  it.each(['org', 'project'] as const)('a %s subscription is usable only while the org has one person', async (ownerType) => {
    const ownerId = ownerType === 'org' ? 'org' : project.id
    await store(ownerType, ownerId, 'SUBSCRIPTION')
    expect((await status(ownerType, ownerId, 'SUBSCRIPTION')).usable).toBe(true)

    const second = await createUser()
    expect(await status(ownerType, ownerId, 'SUBSCRIPTION')).toEqual({
      present: true, expiresAt: expires.toISOString(), termsAcceptedAt: accepted.toISOString(), usable: false, baseUrl: null, hasKey: true,
    })

    await prisma.user.delete({ where: { id: second.id } })
    expect((await status(ownerType, ownerId, 'SUBSCRIPTION')).usable).toBe(true)
  })

  it('a shared subscription shows as usable in a several-person org under the development switch, never in production', async () => {
    await store('org', 'org', 'SUBSCRIPTION')
    await createUser()
    vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', 'true')
    vi.stubEnv('NODE_ENV', 'development')
    expect((await status('org', 'org', 'SUBSCRIPTION')).usable).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect((await status('org', 'org', 'SUBSCRIPTION')).usable).toBe(false)
  })

  it("a person's own subscription is usable in a several-person org", async () => {
    await createUser()
    await store('user', admin.id, 'SUBSCRIPTION')
    expect((await status('user', admin.id, 'SUBSCRIPTION')).usable).toBe(true)
  })

  it("a person cannot see another person's status (403)", async () => {
    const other = await createUser()
    await expect(status('user', other.id, 'SUBSCRIPTION')).rejects.toMatchObject({ statusCode: 403 })
  })

  it("a project's status takes that project's admin", async () => {
    const member = await createUserWithRole('MEMBER')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    await expect(status('project', project.id, 'API_KEY', member)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('an absent subscription is not present', async () => {
    await store('org', 'org', 'API_KEY')
    expect(await status('org', 'org', 'SUBSCRIPTION')).toEqual(NONE)
  })

  it("reads the named provider's row at a boundary, and shows an endpoint's base URL but never its key", async () => {
    await store('user', admin.id, 'API_KEY', { provider: 'openai_compatible', baseUrl: 'http://localhost:11434/v1', expiresAt: null, termsAcceptedAt: null })
    const result = await status('user', admin.id, 'API_KEY', admin, 'openai_compatible')
    expect(result).toMatchObject({ present: true, baseUrl: 'http://localhost:11434/v1', hasKey: true })
    expect(JSON.stringify(result)).not.toContain('the-secret')
    expect(await status('user', admin.id, 'API_KEY')).toEqual(NONE)
  })

  it('says an endpoint stored without a key has none', async () => {
    await store('project', project.id, 'API_KEY', { provider: 'openai_compatible', baseUrl: 'http://gpu/v1', secret: '' })
    expect((await status('project', project.id, 'API_KEY', admin, 'openai_compatible')).hasKey).toBe(false)
  })

  it("reads the org's endpoint for the named provider, with its base URL", async () => {
    await setOrgModelKey('openai_compatible', '', 'http://org-gpu/v1')
    expect(await status('org', 'org', 'API_KEY', admin, 'openai_compatible')).toMatchObject({ present: true, baseUrl: 'http://org-gpu/v1', hasKey: false })
    expect(await status('org', 'org', 'API_KEY')).toEqual(NONE)
  })

  it('refuses an unknown provider (400)', async () => {
    await expect(getModelCredentialStatus({ ownerType: 'user', ownerId: admin.id, kind: 'API_KEY', provider: 'mistral' as never }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
