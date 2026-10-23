import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { saveSetupOrganisation } from '../organisation'

const ctx = (user?: { id: string }) => ({ user }) as any

async function withOrg(name = 'Fernhill') {
  return prisma.org.create({ data: { name } })
}

describe("setup's organisation step: time zone and the default billing profile @SC-1187", () => {
  it('stores the time zone and makes the default billing profile named after the organisation', async () => {
    const admin = await createUserWithRole('ADMIN')
    await withOrg()
    await saveSetupOrganisation({ timeZone: 'Europe/London' }, ctx(admin))
    expect((await prisma.org.findFirstOrThrow()).timeZone).toBe('Europe/London')
    expect(await prisma.billingProfile.findMany()).toMatchObject([{ name: 'Fernhill', isDefault: true, createdById: admin.id }])
  })

  it('does not make a second default when the step is saved again, and follows a renamed organisation until setup is finished', async () => {
    const admin = await createUserWithRole('ADMIN')
    const org = await withOrg()
    await saveSetupOrganisation({ timeZone: 'UTC' }, ctx(admin))
    await prisma.org.update({ where: { id: org.id }, data: { name: 'Fernhill Ltd' } })
    await saveSetupOrganisation({ timeZone: 'UTC' }, ctx(admin))
    expect(await prisma.billingProfile.findMany()).toMatchObject([{ name: 'Fernhill Ltd', isDefault: true }])
  })

  it('refuses a time zone that is not one, a member, and nobody signed in', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await withOrg()
    await expect(saveSetupOrganisation({ timeZone: 'Mars/Olympus' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(saveSetupOrganisation({ timeZone: 'UTC' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(saveSetupOrganisation({ timeZone: 'UTC' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.billingProfile.count()).toBe(0)
  })
})
