/**
 * What hq's screens read and write of Agenthix Cloud for its people, against the real test database: the one ask of a
 * fleet admin, who sees offers, and a dismissal kept per person and per offer.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

const cloud = vi.hoisted(() => ({ name: null as string | null }))
vi.mock('../index', () => ({
  cloudBaseUrl: () => ({ origin: 'https://cloud.test' }),
  cloudConnection: () => ({ state: async () => ({ connection: cloud.name ? { name: cloud.name } : null }) }),
  runByCloud: () => process.env.HQ_RUN_BY_CLOUD === 'true',
}))

import { askForCloudSignIn, dismissCloudOffer, getMyCloudOffers, getMyCloudSignIn, getWhereHqRuns } from '../cloudForMembers'

const as = (user: { id: string } | null) => ({ user, entities: {} }) as any

describe('a member asking for signing in with an Agenthix account @SC-1111', () => {
  it('asks once, for good, and a second ask changes nothing', async () => {
    cloud.name = null
    const dana = await createUser()
    expect(await getMyCloudSignIn(undefined, as(dana))).toMatchObject({ connected: false, linked: false, asked: false })
    await askForCloudSignIn(undefined, as(dana))
    const first = await prisma.cloudSignInAsk.findUniqueOrThrow({ where: { userId: dana.id } })
    await askForCloudSignIn(undefined, as(dana))
    expect((await prisma.cloudSignInAsk.findUniqueOrThrow({ where: { userId: dana.id } })).askedAt).toEqual(first.askedAt)
    expect(await getMyCloudSignIn(undefined, as(dana))).toMatchObject({ asked: true })
    expect(await prisma.cloudSignInAsk.count()).toBe(1)
  })

  it('is refused while hq is connected, and for someone not signed in', async () => {
    cloud.name = 'Acme Robotics'
    const dana = await createUser()
    await expect(askForCloudSignIn(undefined, as(dana))).rejects.toMatchObject({ statusCode: 409 })
    await expect(askForCloudSignIn(undefined, as(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.cloudSignInAsk.count()).toBe(0)
  })

  it('reads connected and linked from hq\'s own records, and where hq runs', async () => {
    cloud.name = 'Acme Robotics'
    const dana = await createUser()
    await prisma.cloudAccountLink.create({ data: { userId: dana.id, issuer: 'https://cloud.test', subject: 'acct_dana' } })
    expect(await getMyCloudSignIn(undefined, as(dana))).toEqual({ connected: true, linked: true, asked: false, cloudOrigin: 'https://cloud.test' })
    expect(await getWhereHqRuns(undefined, as(dana))).toEqual({ hosting: 'self', connectedAs: 'Acme Robotics' })
  })

  it('says hq runs on Agenthix Cloud when its host service told it @SC-1123', async () => {
    vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
    try {
      expect(await getWhereHqRuns(undefined, as(await createUser()))).toMatchObject({ hosting: 'cloud' })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('offers to fleet admins @SC-1112', () => {
  it('are for a fleet admin only; dismissing one is kept for that person and that offer alone', async () => {
    const admin = await createUser({ fleetAdmin: true })
    const other = await createUser({ fleetAdmin: true })
    const member = await createUser()
    expect(await getMyCloudOffers(undefined, as(member))).toMatchObject({ fleetAdmin: false, dismissed: [] })
    await dismissCloudOffer({ offer: 'site' }, as(admin))
    await dismissCloudOffer({ offer: 'site' }, as(admin))
    expect(await getMyCloudOffers(undefined, as(admin))).toMatchObject({ fleetAdmin: true, dismissed: ['site'] })
    expect(await getMyCloudOffers(undefined, as(other))).toMatchObject({ fleetAdmin: true, dismissed: [] })
    expect(await prisma.offerDismissal.count({ where: { userId: admin.id } })).toBe(1)
  })

  it('refuses a member, an unknown offer, and someone who has left', async () => {
    const member = await createUser()
    const gone = await createUser({ fleetAdmin: true, deactivatedAt: new Date() })
    const admin = await createUser({ fleetAdmin: true })
    await expect(dismissCloudOffer({ offer: 'site' }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(dismissCloudOffer({ offer: 'site' }, as(gone))).rejects.toMatchObject({ statusCode: 403 })
    await expect(dismissCloudOffer({ offer: 'nonsense' }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.offerDismissal.count()).toBe(0)
  })
})
