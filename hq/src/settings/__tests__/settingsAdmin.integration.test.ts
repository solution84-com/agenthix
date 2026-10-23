import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole } from '../../test/factories'

// The admin's settings: people and their roles (SC-096, SC-205), the environment
// and version (SC-092), the site's name (SC-086), risk rules (SC-087) and the
// GitHub App connection. Against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))

import { updateUserRole, updateSiteConfig, updateRiskRules, refreshGithubInstallations, disconnectGithubApp } from '../actions'
import { getEnvStatus, getVersionInfo, getSiteConfig } from '../queries'
import { getOrgPeople } from '../orgPeopleQueries'
import { BUILD_INFO } from '../../server/buildInfo'

const ctx = (user?: { id: string }) =>
  ({ user, entities: { User: prisma.user, UserSettings: prisma.userSettings, SiteConfig: prisma.siteConfig } }) as any

describe('updateUserRole @SC-096', () => {
  it("an admin changes another member's role", async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await updateUserRole({ userId: member.id, role: 'ADMIN' }, ctx(admin))
    expect((await prisma.userSettings.findUniqueOrThrow({ where: { userId: member.id } })).role).toBe('ADMIN')
  })

  it('gives a role to a person with no settings row yet', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUser()
    await updateUserRole({ userId: member.id, role: 'ADMIN' }, ctx(admin))
    expect((await prisma.userSettings.findUniqueOrThrow({ where: { userId: member.id } })).role).toBe('ADMIN')
  })

  it('refuses changing your own role (400)', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(updateUserRole({ userId: admin.id, role: 'MEMBER' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.userSettings.findUniqueOrThrow({ where: { userId: admin.id } })).role).toBe('ADMIN')
  })
})

describe('non-admins cannot manage members @SC-205', () => {
  it('updateUserRole refuses a non-admin (403) and changes nothing', async () => {
    const operator = await createUserWithRole('MEMBER')
    const member = await createUserWithRole('MEMBER')
    await expect(updateUserRole({ userId: member.id, role: 'ADMIN' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.userSettings.findUniqueOrThrow({ where: { userId: member.id } })).role).toBe('MEMBER')
  })

  it('getOrgPeople refuses a non-admin (403) and a caller who is not signed in (401)', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await expect(getOrgPeople(undefined, ctx(viewer))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getOrgPeople(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('environment and version status @SC-092', () => {
  it('getEnvStatus gives an admin labelled sections saying which keys are set', async () => {
    vi.stubEnv('SECRETS_MASTER_KEY', 'set')
    vi.stubEnv('WASP_SERVER_URL', 'https://hq.example.com')
    const admin = await createUserWithRole('ADMIN')

    const { address, sections } = await getEnvStatus(undefined as any, ctx(admin))

    expect(address).toBe('https://hq.example.com')
    expect(sections.map((s) => s.label)).toEqual(['Site Security', 'Database', 'Server', 'Filesystem'])
    const key = (k: string) => sections.flatMap((s) => s.keys).find((e) => e.key === k)
    expect(key('SECRETS_MASTER_KEY')).toEqual({ key: 'SECRETS_MASTER_KEY', set: true, required: 'always' })
    expect(key('SITE_ADMIN_KEY')).toBeUndefined()
    expect(key('ANTHROPIC_API_KEY')).toBeUndefined()
    vi.unstubAllEnvs()
  })

  it('getEnvStatus refuses a non-admin (403)', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(getEnvStatus(undefined as any, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('getVersionInfo gives any signed-in person the build metadata', async () => {
    const viewer = await createUserWithRole('MEMBER')
    expect(await getVersionInfo(undefined as any, ctx(viewer))).toEqual(BUILD_INFO)
    await expect(getVersionInfo(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('updateSiteConfig and getSiteConfig @SC-086', () => {
  it('reads defaults before anything is saved, then what an admin saved, trimmed', async () => {
    const admin = await createUserWithRole('ADMIN')
    expect(await getSiteConfig(undefined as any, ctx(admin))).toMatchObject({ name: 'Agenthix Site', description: '' })

    await updateSiteConfig({ name: '  My Site  ', description: 'first' }, ctx(admin))
    await updateSiteConfig({ name: 'My Awesome Site', description: 'desc' }, ctx(admin))

    expect(await prisma.siteConfig.count()).toBe(1)
    expect(await getSiteConfig(undefined as any, ctx(admin))).toMatchObject({ name: 'My Awesome Site', description: 'desc' })
  })

  it('refuses an empty name (400), a non-admin (403) and a caller who is not signed in (401)', async () => {
    const admin = await createUserWithRole('ADMIN')
    const operator = await createUserWithRole('MEMBER')
    await expect(updateSiteConfig({ name: '   ', description: '' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateSiteConfig({ name: 'foo', description: '' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateSiteConfig({ name: 'foo', description: '' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(getSiteConfig(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.siteConfig.count()).toBe(0)
  })
})

describe('updateRiskRules @SC-087', () => {
  it('creates a default site config holding the rules, then updates the same row', async () => {
    const admin = await createUserWithRole('ADMIN')
    await updateRiskRules({ rules: [{ pattern: 'curl', riskLevel: 'medium' }] }, ctx(admin))
    expect(await prisma.siteConfig.findFirstOrThrow()).toMatchObject({ name: 'default', riskRules: [{ pattern: 'curl', riskLevel: 'medium' }] })

    await updateRiskRules({ rules: [{ pattern: 'rm -rf', riskLevel: 'high' }] }, ctx(admin))
    const rows = await prisma.siteConfig.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].riskRules).toEqual([{ pattern: 'rm -rf', riskLevel: 'high' }])
  })

  it('refuses a non-admin (403) and a caller who is not signed in (401)', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(updateRiskRules({ rules: [] }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateRiskRules({ rules: [] }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.siteConfig.count()).toBe(0)
  })
})

describe('GitHub App connection actions', () => {
  async function registeredApp() {
    await prisma.gitHubApp.create({
      data: { appId: 1, slug: 'agenthix', privateKey: 'k' },
    })
    await prisma.gitHubInstallation.create({ data: { installationId: 7, accountLogin: 'acme', accountType: 'Organization' } })
  }

  it.each([
    ['refreshGithubInstallations', refreshGithubInstallations],
    ['disconnectGithubApp', disconnectGithubApp],
  ] as const)('%s refuses a caller who is not signed in (401) or not an admin (403), leaving the connection', async (_name, action) => {
    await registeredApp()
    const operator = await createUserWithRole('MEMBER')
    await expect(action({}, { user: undefined })).rejects.toMatchObject({ statusCode: 401 })
    await expect(action({}, { user: operator })).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.gitHubApp.count()).toBe(1)
    expect(await prisma.gitHubInstallation.count()).toBe(1)
  })

  it('an admin disconnects the app and its installations', async () => {
    await registeredApp()
    const admin = await createUserWithRole('ADMIN')
    await expect(disconnectGithubApp({}, { user: admin })).resolves.toEqual({ ok: true })
    expect(await prisma.gitHubApp.count()).toBe(0)
    expect(await prisma.gitHubInstallation.count()).toBe(0)
  })

  it('an admin passes the gate to refresh, which then needs a registered app', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(refreshGithubInstallations({}, { user: admin })).rejects.toThrow(/No GitHub App is registered/)
  })
})
