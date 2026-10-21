/**
 * The browser-side organisation role gate every organisation-wide action in
 * spec §H2's table uses (@SC-310), against the real test database: a person's
 * role is their settings row, and no row is no role. Work in a project is the
 * project's role (adr-0102, membershipRules). Also the count of people in the
 * org, read each time.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { requireRole } from '../requireRole'
import { countOrgPeople } from '../orgPeople'

describe('requireRole @SC-310', () => {
  it('401s a caller who is not signed in', async () => {
    await expect(requireRole({ user: undefined }, 'MEMBER', 'Doing a thing')).rejects.toMatchObject({ statusCode: 401 })
    await expect(requireRole({ user: null }, 'MEMBER', 'Doing a thing')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('403s a caller below the floor, naming the floor and the action', async () => {
    const member = await createUserWithRole('MEMBER')
    const err = await requireRole({ user: member }, 'ADMIN', 'Deleting a product').catch((e) => e)
    expect(err).toMatchObject({ statusCode: 403 })
    expect(err.message).toContain('ADMIN')
    expect(err.message).toContain('Deleting a product')
  })

  it('passes at exactly the floor role, and above it', async () => {
    await expect(requireRole({ user: await createUserWithRole('MEMBER') }, 'MEMBER', 'Creating a product')).resolves.toBeUndefined()
    await expect(requireRole({ user: await createUserWithRole('ADMIN') }, 'MEMBER', 'Creating a product')).resolves.toBeUndefined()
  })

  it('refuses a caller with no settings row at all — no role fails every floor', async () => {
    await expect(requireRole({ user: await createUser() }, 'MEMBER', 'Doing a thing')).rejects.toMatchObject({ statusCode: 403 })
  })

  it("reads the caller's own role, not anyone else's", async () => {
    const member = await createUserWithRole('MEMBER')
    await createUserWithRole('ADMIN')
    await expect(requireRole({ user: member }, 'ADMIN', 'Doing a thing')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('countOrgPeople', () => {
  it('is the number of people, read from the database each time', async () => {
    await createUser()
    expect(await countOrgPeople()).toBe(1)
    await createUser()
    await createUser()
    expect(await countOrgPeople()).toBe(3)
    await prisma.user.deleteMany()
    expect(await countOrgPeople()).toBe(0)
  })
})
