import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// Setup runs once per hq, for its first admin only (getting-in spec, The first
// admin), against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { completeSetup } from '../actions'
import { getSetupData } from '../queries'

const ctx = (user?: { id: string }) => ({ user }) as any

/** The admin who came in by the first-admin link. */
async function firstAdmin() {
  const admin = await createUserWithRole('ADMIN')
  await prisma.invite.create({
    data: { kind: 'FIRST_ADMIN', tokenHash: `h-${admin.id}`, role: 'ADMIN', createdBy: null, consumedAt: new Date(), consumedBy: admin.id },
  })
  return admin
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

  it('succeeds with no Execution Site, and creates nothing beyond the record (R-169)', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await firstAdmin()

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
