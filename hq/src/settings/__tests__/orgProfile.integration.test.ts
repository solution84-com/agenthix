import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// SC-099 view the organisation profile · SC-095 update it, with the org package it
// feeds written in the same transaction · SC-310 the role floor. Against the real
// test database; only the package write can be made to fail, to prove the rollback.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))

const failNextPackageWrite = vi.hoisted(() => ({ value: false }))
vi.mock('../../packages/orgPackageService', async () => {
  const actual = await vi.importActual<typeof import('../../packages/orgPackageService')>('../../packages/orgPackageService')
  const { PackageContentError } = await import('../../packages/packageStore')
  return {
    ...actual,
    changeOrgPackage: async (...args: Parameters<typeof actual.changeOrgPackage>) => {
      if (failNextPackageWrite.value) {
        failNextPackageWrite.value = false
        throw new PackageContentError('bad content')
      }
      return actual.changeOrgPackage(...args)
    },
  }
})

import { getOrg } from '../queries'
import { updateOrg } from '../actions'
import { getCurrentPackage } from '../../packages/packageStore'

// A first package write reads hq's bundled assets; the server finds them relative to
// where Wasp runs it, so point the test at the checkout's own.
beforeAll(() => { vi.stubEnv('HQ_ASSETS_ROOT', path.resolve(__dirname, '../../../assets')) })
afterAll(() => { vi.unstubAllEnvs() })

const ctx = (user?: { id: string }) => ({ user, entities: { Org: prisma.org } }) as any
const args = { name: 'Acme', vision: 'V', mission: 'M' }

describe('getOrg @SC-099', () => {
  it('answers defaults before an organisation exists, then the saved profile', async () => {
    const viewer = await createUserWithRole('MEMBER')
    expect(await getOrg(undefined as any, ctx(viewer))).toEqual({ id: '', name: 'My Organisation', vision: '', mission: '' })

    const org = await prisma.org.create({ data: args })
    expect(await getOrg(undefined as any, ctx(viewer))).toEqual({ id: org.id, ...args })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getOrg(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('updateOrg @SC-095', () => {
  it("updates the organisation hq already has, never a second one, and writes its package as the admin", async () => {
    const admin = await createUserWithRole('ADMIN')
    const org = await prisma.org.create({ data: { name: 'My Organisation' } })

    await updateOrg(args, ctx(admin))

    expect(await prisma.org.findMany()).toEqual([expect.objectContaining({ id: org.id, ...args })])
    expect(await getCurrentPackage('org', org.id)).toMatchObject({ updatedById: admin.id })
  })

  it('still creates one when none exists', async () => {
    const admin = await createUserWithRole('ADMIN')
    await updateOrg(args, ctx(admin))
    const org = await prisma.org.findFirstOrThrow()
    expect(org).toMatchObject(args)
    expect(await getCurrentPackage('org', org.id)).not.toBeNull()
  })

  it('rolls the org row back when the package write fails (400)', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'My Organisation' } })
    failNextPackageWrite.value = true

    await expect(updateOrg(args, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })

    expect((await prisma.org.findFirstOrThrow()).name).toBe('My Organisation')
  })
})

describe('updateOrg role floor @SC-310', () => {
  it('refuses a Member (403) and a caller who is not signed in (401), changing nothing', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    for (const role of ['MEMBER'] as const) {
      const caller = await createUserWithRole(role)
      await expect(updateOrg(args, ctx(caller))).rejects.toMatchObject({ statusCode: 403 })
    }
    await expect(updateOrg(args, ctx())).rejects.toMatchObject({ statusCode: 401 })

    const org = await prisma.org.findFirstOrThrow()
    expect(org.name).toBe('My Organisation')
    expect(await getCurrentPackage('org', org.id)).toBeNull()
  })
})
