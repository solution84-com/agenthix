/**
 * The organisation's side of model access, against the real test database:
 * whether shared runs have no credential to use,
 * the org's web-search key, and that a credential does not outlive the person
 * or project it belongs to.
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
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { computeModelAccessGap } from '../modelAccessGap'
import { setWebSearchKey, deleteWebSearchKey } from '../webSearchKeyActions'
import { getWebSearchKeyStatus } from '../webSearchKeyQueries'
import { getWebSearchKey } from '../../server/providerService'
import { removePerson } from '../../settings/leaving'
import { erasePerson } from '../../settings/erasePerson'
import { deleteProject } from '../../projects/projectService'
import { orgKey, storeKey, storeSubscription, peopleInOrg } from './runCredentialFixtures'

// The operations take Wasp's generated context type; these pass what they read.
const ctx = (user?: { id: string }) => ({ user, entities: { User: prisma.user, UserSettings: prisma.userSettings } }) as any

beforeEach(() => {
  // The integration run takes hq's .env.server as its base, which may turn the development switch on.
  vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('computeModelAccessGap', () => {
  it.each([
    [false, 1], [true, 1], [false, 3], [true, 3],
  ])('is not missing when the org has an API key (subscription %s, %i people)', async (subscription, people) => {
    await peopleInOrg(people)
    await orgKey('openrouter', 'k')
    if (subscription) await storeSubscription('org', 'org')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: false, reason: null })
  })

  it('counts an OpenAI-compatible endpoint with no key as the org having a credential', async () => {
    await orgKey('openai_compatible', '', 'http://gpu/v1')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: false, reason: null })
  })

  it('is not missing with no key, one person and a stored org subscription', async () => {
    await peopleInOrg(1)
    await storeSubscription('org', 'org')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: false, reason: null })
  })

  it.each([1, 2])('is missing, no-credential, with no key and nothing stored (%i people)', async (people) => {
    await peopleInOrg(people)
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: true, reason: 'no-credential' })
  })

  it('is missing, several-people, with no key, two people and a stored subscription', async () => {
    await peopleInOrg(2)
    await storeSubscription('org', 'org')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: true, reason: 'several-people' })
  })

  it("does not count a person's or a project's own credential — only the org's", async () => {
    await peopleInOrg(1)
    await storeKey('user', 'u1', 'k')
    await storeKey('project', 'p1', 'k')
    await storeSubscription('project', 'p1')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: true, reason: 'no-credential' })
  })

  it('is not missing with several people under the development switch, and still is in production', async () => {
    await peopleInOrg(2)
    await storeSubscription('org', 'org')
    vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', 'true')
    vi.stubEnv('NODE_ENV', 'development')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: false, reason: null })
    vi.stubEnv('NODE_ENV', 'production')
    await expect(computeModelAccessGap()).resolves.toEqual({ missing: true, reason: 'several-people' })
  })

  it('does not count people when a key settles it', async () => {
    await orgKey('anthropic', 'k')
    const count = vi.spyOn(prisma.user, 'count')
    await computeModelAccessGap()
    expect(count).not.toHaveBeenCalled()
  })
})

describe("the org's web-search key — an admin sets and removes it; only its presence is read back", () => {
  let admin: { id: string }
  let operator: { id: string }
  beforeEach(async () => {
    admin = await createUserWithRole('ADMIN')
    operator = await createUserWithRole('MEMBER')
  })

  it('stores the trimmed key, encrypted, for an admin, and says it is present', async () => {
    await setWebSearchKey({ secret: '  exa-1  ' }, ctx(admin))
    expect(await getWebSearchKey()).toBe('exa-1')
    expect(JSON.stringify(await prisma.provider.findMany())).not.toContain('exa-1')
    await expect(getWebSearchKeyStatus(undefined, ctx(admin))).resolves.toEqual({ present: true })
  })

  it('refuses anyone below admin (403), storing nothing', async () => {
    await expect(setWebSearchKey({ secret: 'exa-1' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await getWebSearchKey()).toBeNull()
  })

  it('refuses an empty key (400) and an unauthenticated caller (401)', async () => {
    await expect(setWebSearchKey({ secret: ' ' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setWebSearchKey({ secret: 'k' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await getWebSearchKey()).toBeNull()
  })

  it('refuses when hq cannot store secrets', async () => {
    vi.stubEnv('SECRETS_MASTER_KEY', '')
    await expect(setWebSearchKey({ secret: 'k' }, ctx(admin))).rejects.toMatchObject({ statusCode: 503 })
    expect(await prisma.provider.count()).toBe(0)
  })

  it('removes it for an admin and refuses anyone else', async () => {
    await setWebSearchKey({ secret: 'exa-1' }, ctx(admin))
    await expect(deleteWebSearchKey(undefined, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await getWebSearchKey()).toBe('exa-1')
    await deleteWebSearchKey(undefined, ctx(admin))
    await expect(getWebSearchKeyStatus(undefined, ctx(admin))).resolves.toEqual({ present: false })
  })

  it('its status is for admins only', async () => {
    await expect(getWebSearchKeyStatus(undefined, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('a model credential does not outlive the boundary it belongs to', () => {
  // ModelCredential is keyed by (ownerType, ownerId), not a relation, so nothing cascades to it.
  // adr-0100: Remove keeps them, unused; Erase deletes them.
  it('erasing a person removes their model credentials, and nobody else\'s; removing them alone keeps them', async () => {
    const admin = await createUserWithRole('ADMIN')
    const leaving = await createUserWithRole('MEMBER', { displayName: 'Leaving' })
    await storeSubscription('user', leaving.id)
    await storeKey('user', leaving.id, 'k')
    await storeKey('user', admin.id, 'k')

    await removePerson({ userId: leaving.id }, ctx(admin))
    expect(await prisma.modelCredential.count({ where: { ownerId: leaving.id } })).toBe(2)

    await erasePerson({ userId: leaving.id, confirm: 'Leaving' }, ctx(admin))

    expect(await prisma.modelCredential.findMany({ select: { ownerId: true } })).toEqual([{ ownerId: admin.id }])
  })

  it("deleting a project deletes its model credential, and no other project's", async () => {
    const project = await createProject()
    const other = await createProject()
    await storeKey('project', project.id, 'k')
    await storeKey('project', other.id, 'k')

    await deleteProject(project.id)

    expect(await prisma.modelCredential.findMany({ select: { ownerId: true } })).toEqual([{ ownerId: other.id }])
  })
})
