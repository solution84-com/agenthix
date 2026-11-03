/**
 * The *Features* screen's operations against the real test database (adr-0172): an admin's switch stored on the
 * organisation's record with who and when, the refusals, and `requireFeature` following the record at once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'
import { withFeature } from '../../test/withFeature'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { getFeatures, setFeature } from '../operations'
import { requireFeature } from '../requireFeature'
import { isOrgFeatureOn } from '../switches'

afterEach(() => { vi.unstubAllEnvs() })

const org = () => prisma.org.create({ data: { name: 'Fernhill' } })
const as = (user: { id: string }) => ({ user: { id: user.id } })

describe('switching a feature @SC-1767', () => {
  it("stores an admin's switch on the organisation's record, with who and when, and the gate follows it at once", async () => {
    await org()
    const admin = await createUserWithRole('ADMIN', { displayName: 'Sam' })
    await expect(requireFeature('marketplace')).rejects.toMatchObject({ statusCode: 404 })

    const answer = await setFeature({ flag: 'marketplace', on: true }, as(admin))

    const stored = (await prisma.org.findFirstOrThrow()).featureSwitches as Record<string, { on: boolean; byUserId: string; at: string }>
    expect(stored.marketplace).toMatchObject({ on: true, byUserId: admin.id })
    expect(Date.parse(stored.marketplace.at)).not.toBeNaN()
    expect(answer.flags.find(f => f.flag === 'marketplace')).toMatchObject({ on: true, changed: { by: 'Sam' } })
    await expect(requireFeature('marketplace')).resolves.toBeUndefined()
  })

  it('keeps each switch when two are made', async () => {
    await org()
    const admin = await createUserWithRole('ADMIN')
    await Promise.all([
      setFeature({ flag: 'marketplace', on: true }, as(admin)),
      setFeature({ flag: 'usageBilling', on: true }, as(admin)),
    ])
    const stored = (await prisma.org.findFirstOrThrow()).featureSwitches as Record<string, { on: boolean }>
    expect(Object.keys(stored).sort()).toEqual(['marketplace', 'usageBilling'])
  })

  it('refuses a member, and changes nothing', async () => {
    await org()
    const member = await createUserWithRole('MEMBER')
    await expect(setFeature({ flag: 'marketplace', on: true }, as(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/Nothing was changed\.$/) })
    expect((await prisma.org.findFirstOrThrow()).featureSwitches).toEqual({})
  })

  it('refuses a flag not in the list, or no on or off', async () => {
    await org()
    const admin = await createUserWithRole('ADMIN')
    await expect(setFeature({ flag: 'everything', on: true }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setFeature({ flag: 'marketplace', on: 'yes' as never }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.org.findFirstOrThrow()).featureSwitches).toEqual({})
  })

  it('in production refuses a flag that is not in beta or newly released, and changes nothing', async () => {
    await org()
    const admin = await createUserWithRole('ADMIN')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(setFeature({ flag: 'marketplace', on: true }, as(admin)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/Nothing was changed\.$/) })
    expect((await prisma.org.findFirstOrThrow()).featureSwitches).toEqual({})
  })

  it('says so when there is no organisation yet', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(setFeature({ flag: 'marketplace', on: true }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("which features are on, for screens @SC-1767", () => {
  it("answers everyone signed in, and only an admin is told who switched each", async () => {
    await org()
    const admin = await createUserWithRole('ADMIN', { displayName: 'Sam' })
    const member = await createUserWithRole('MEMBER')
    await setFeature({ flag: 'marketplace', on: true }, as(admin))
    const seen = await getFeatures({}, as(member))
    expect(seen.isAdmin).toBe(false)
    expect(seen.flags.find(f => f.flag === 'marketplace')).toMatchObject({ on: true, changed: null })
    await expect(getFeatures({}, {})).rejects.toMatchObject({ statusCode: 401 })
  })

  it('in a test run is as shipped: a preview flag is off with no switch', async () => {
    await org()
    const member = await createUserWithRole('MEMBER')
    expect((await getFeatures({}, as(member))).flags.every(f => f.stage !== 'preview' || !f.on)).toBe(true)
  })
})

describe('withFeature in the integration suite @SC-1774', () => {
  withFeature('marketplace', () => {
    it('is on inside its group', async () => {
      expect(await isOrgFeatureOn('marketplace')).toBe(true)
    })
  })

  it('is off outside its group', async () => {
    expect(await isOrgFeatureOn('marketplace')).toBe(false)
  })
})
