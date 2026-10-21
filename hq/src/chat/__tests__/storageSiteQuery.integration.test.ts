/**
 * Chat's Site fact (every screen reviewed spec §7), against the real test
 * database: the site holding the caller's own storage, or none until their
 * storage has been placed — and reading it never places it.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getMyStorageSite } from '../storageSiteQuery'

const ctx = (user: { id: string } | undefined) => ({ user, entities: {} }) as any

describe('getMyStorageSite @SC-507', () => {
  it('refuses a caller who is not signed in', async () => {
    await expect(getMyStorageSite(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })

  it("is null until the caller's storage is placed, and does not place it", async () => {
    const me = await createUser()
    await ensureExecutionSite()

    expect(await getMyStorageSite(undefined, ctx(me))).toBeNull()
    expect(await prisma.userStoragePlacement.count()).toBe(0)
  })

  it("names the site the caller's storage is placed on, and nobody else's", async () => {
    const me = await createUser()
    const other = await createUser()
    const site = await ensureExecutionSite({ label: 'Development' })
    await prisma.userStoragePlacement.create({ data: { userId: other.id, siteId: site.id } })

    expect(await getMyStorageSite(undefined, ctx(me))).toBeNull()

    await prisma.userStoragePlacement.create({ data: { userId: me.id, siteId: site.id } })
    expect(await getMyStorageSite(undefined, ctx(me))).toEqual({ id: site.id, label: "Development · HQ's site" })
  })
})
