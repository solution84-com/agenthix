import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'
import { prismaProviderStore } from '../../providers/store'

// Setup runs once per hq, for its first admin only (getting-in spec, The first
// admin), against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { completeSetup } from '../actions'
import { getSetupData, getSetupResume } from '../queries'
import { claimState } from '../setupState'

const ctx = (user?: { id: string }) => ({ user }) as any

/** The admin who came in by the first-admin link. */
async function firstAdmin() {
  const admin = await createUserWithRole('ADMIN')
  await prisma.invite.create({
    data: { kind: 'FIRST_ADMIN', tokenHash: `h-${admin.id}`, role: 'ADMIN', createdBy: null, consumedAt: new Date(), consumedBy: admin.id },
  })
  return admin
}

/** A working provider of one vendor, as setup's steps leave it. */
const addProvider = (vendor: 'anthropic' | 'assemblyai' | 'inworld') => prismaProviderStore.create({
  name: vendor, vendor, credentialKind: 'api_key', baseUrl: null, keyHint: 'fake', state: 'works', stateDetail: null,
  secret: null, lastCheckedAt: null, lastWorkedAt: null,
})

async function withModelsAndVoice() {
  for (const vendor of ['anthropic', 'assemblyai', 'inworld'] as const) await addProvider(vendor)
}

afterEach(() => vi.unstubAllEnvs())

describe('setup, once per hq @SC-710', () => {
  it('waits on the first admin until they finish it, and then on nobody', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()
    expect(await getSetupData(undefined as any, ctx(admin))).toMatchObject({ needsSetup: true, setupComplete: false, isAdmin: true })
    await completeSetup(undefined as any, ctx(admin))

    expect(await getSetupData(undefined as any, ctx(admin))).toMatchObject({ needsSetup: false, setupComplete: true })
    expect((await prisma.org.findFirstOrThrow()).setupCompletedAt).not.toBeNull()
  })

  it('never sends an admin invited later through setup, even while it is unfinished', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    await firstAdmin()
    const later = await createUserWithRole('ADMIN')

    expect(await getSetupData(undefined as any, ctx(later))).toMatchObject({ needsSetup: false, isAdmin: true })
    await completeSetup(undefined as any, ctx(later))
    expect((await prisma.org.findFirstOrThrow()).setupCompletedAt).toBeNull()
  })

  it('finishes with no provider at all, leaving models and voice for later (ADR-0160) @SC-1185', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()
    await expect(completeSetup(undefined as any, ctx(admin))).resolves.toEqual({ done: true })
    const org = await prisma.org.findFirstOrThrow()
    expect(org.setupCompletedAt).not.toBeNull()
    expect(org.defaultConversationProviderId).toBeNull()
    expect(org.defaultTtsProviderId).toBeNull()
  })

  it('finishes with one Inworld key, which covers hearing and speaking, and writes those defaults @SC-1185', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()
    const inworld = await addProvider('inworld')
    await expect(completeSetup(undefined as any, ctx(admin))).resolves.toEqual({ done: true })
    const org = await prisma.org.findFirstOrThrow()
    expect(org.defaultTtsProviderId).toBe(inworld.id)
    expect(org.defaultSttProviderId).toBe(inworld.id)
  })

  it('finishes with two providers, a model provider and a hearing one, and sets each default from the one that serves it @SC-1185', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()
    const anthropic = await addProvider('anthropic')
    const assembly = await addProvider('assemblyai')
    await completeSetup(undefined as any, ctx(admin))
    const org = await prisma.org.findFirstOrThrow()
    expect(org.defaultConversationProviderId).toBe(anthropic.id)
    expect(org.defaultSttProviderId).toBe(assembly.id)
    expect(org.defaultTtsProviderId).toBeNull()
  })

  it('succeeds with no Execution Site, and creates nothing beyond the record (R-169)', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()
    await withModelsAndVoice()

    await expect(completeSetup(undefined as any, ctx(admin))).resolves.toEqual({ done: true })

    expect(await prisma.executionSite.count()).toBe(0)
    expect(await prisma.project.count()).toBe(0)
    expect(await prisma.agent.count()).toBe(0)
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(completeSetup(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(getSetupData(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("hq's claim state and where setup resumes @SC-709 @SC-1182", () => {
  it('goes from unclaimed to setting up to set up, and resumes at the organisation, then the last look, whether or not a provider is added', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    expect(await claimState()).toBe('unclaimed')

    const admin = await firstAdmin()
    expect(await claimState()).toBe('setting_up')
    expect(await getSetupResume(undefined as any, ctx(admin))).toEqual({ step: 'organisation' })

    await prisma.billingProfile.create({ data: { name: 'My Organisation', isDefault: true, createdById: admin.id } })
    expect(await getSetupResume(undefined as any, ctx(admin))).toEqual({ step: 'review' })

    await addProvider('anthropic')
    expect(await getSetupResume(undefined as any, ctx(admin))).toEqual({ step: 'review' })

    await completeSetup(undefined as any, ctx(admin))
    expect(await claimState()).toBe('set_up')
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getSetupResume(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("hq's own site, for setup's Model access step @SC-711", () => {
  it('is unpaired without a pairing secret, and connected once its row is online', async () => {
    const admin = await firstAdmin()
    vi.stubEnv('HQ_PAIRING_SECRET', '')
    expect((await getSetupData(undefined as any, ctx(admin))).hqSite).toEqual({ state: 'unpaired', dockerRunning: null, cause: null })

    vi.stubEnv('HQ_PAIRING_SECRET', 'x'.repeat(40))
    await prisma.executionSite.create({ data: { siteId: 'hq-site', label: 'HQ', isDefault: true, status: 'ONLINE' } })
    expect((await getSetupData(undefined as any, ctx(admin))).hqSite).toMatchObject({ state: 'connected' })
  })
})
