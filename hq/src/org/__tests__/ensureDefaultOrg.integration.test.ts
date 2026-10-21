import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', () => ({ prisma }))

import { ensureDefaultOrg } from '../ensureDefaultOrg'

describe('ensureDefaultOrg against a real database', () => {
  it('finds one Org after a fresh boot, and exactly one after a second', async () => {
    expect(await prisma.org.count()).toBe(0)
    expect(await ensureDefaultOrg()).toBe('created')
    expect(await ensureDefaultOrg()).toBe('existing')
    const orgs = await prisma.org.findMany()
    expect(orgs).toHaveLength(1)
    expect(orgs[0].name).toBe('My Organisation')
  })

  it('leaves an organisation an admin already named alone', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    expect(await ensureDefaultOrg()).toBe('existing')
    expect((await prisma.org.findMany()).map(o => o.name)).toEqual(['Acme'])
  })
})
