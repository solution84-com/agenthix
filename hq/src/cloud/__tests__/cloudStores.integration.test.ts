/**
 * hq's connection to Cloud against the real test database: the key kept with hq's encrypted secrets, the record, and
 * who may read the state through the console link, and who connects and disconnects from hq — Cloud itself is the stand-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole } from '../../test/factories'
import { CloudStandIn } from './cloudStandIn'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../fleet/consoleFacts', () => ({
  hqAbout: async () => ({ organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }),
}))

import { cloudConnectionStore, cloudKeyStore } from '../cloudStores'
import { cloudConnectionKey, cloudConsoleServices, connectByCloud } from '..'
import { connectHqToCloud, disconnectHqFromCloud, getHqCloudConnection } from '../adminCloud'
import { withFeature } from '../../test/withFeature'

const cloud = new CloudStandIn(() => Date.now())

beforeEach(() => {
  vi.stubEnv('CLOUD_URL', 'https://cloud.test')
  vi.stubGlobal('fetch', cloud.fetch)
  cloud.requests.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("the connection's key and record", () => {
  it('the private key is kept encrypted, and read back whole @SC-1087', async () => {
    const made = await cloudKeyStore.create()
    const row = await prisma.siteSecret.findUniqueOrThrow({ where: { type: 'CLOUD_CONNECTION_KEY' } })
    expect(row.value).toContain(made.publicKey)
    expect(row.value).not.toContain(made.privateKey)
    expect(await cloudKeyStore.read()).toEqual(made)
    await cloudKeyStore.clear()
    expect(await cloudKeyStore.read()).toBeNull()
  })

  it('the record is one row while connected, none after @SC-1090', async () => {
    const c = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', clientId: 'k'.repeat(43), connectedAt: '2026-01-01T00:00:00.000Z' }
    await cloudConnectionStore.write(c)
    await cloudConnectionStore.write({ ...c, name: 'Acme' })
    expect(await prisma.cloudConnection.count()).toBe(1)
    expect(await cloudConnectionStore.read()).toEqual({ ...c, name: 'Acme' })
    await cloudConnectionStore.clear()
    expect(await cloudConnectionStore.read()).toBeNull()
  })
})

describe('connecting HQ to Cloud while its flag is off (adr-0189)', () => {
  it('refuses the admin operations and the console link\'s methods as not available, and asks Cloud nothing', async () => {
    const admin = await createUserWithRole('ADMIN')
    const asUser = (user: { id: string }) => ({ user: { id: user.id } }) as never
    for (const op of [getHqCloudConnection, connectHqToCloud, disconnectHqFromCloud]) {
      await expect(op(undefined, asUser(admin))).rejects.toMatchObject({ statusCode: 404 })
    }
    const services = cloudConsoleServices()
    await expect(services['cloud.state']({ byUserId: admin.id })).rejects.toMatchObject({ code: 'not_found' })
    await expect(services['cloud.askCount']({ byUserId: admin.id })).rejects.toMatchObject({ code: 'not_found' })
    expect(await prisma.cloudConnection.count()).toBe(0)
  })
})

withFeature('cloud', () => {
  describe('the Fleet Console no longer connects HQ to Cloud @SC-1090', () => {
    const services = cloudConsoleServices()

    it('a fleet admin may read the state, and connecting and disconnecting are refused with where to do them', async () => {
      const sam = await createUserWithRole('ADMIN', { fleetAdmin: true })
      expect(await services['cloud.state']({ byUserId: sam.id })).toEqual({ connection: null, connecting: null, lastAttempt: null, runByCloud: false, problem: null })
      await expect(services['cloud.connect']({ byUserId: sam.id })).rejects.toMatchObject({ code: 'not_allowed', message: expect.stringContaining('Manage › Providers') })
      await expect(services['cloud.disconnect']({ byUserId: sam.id })).rejects.toMatchObject({ code: 'not_allowed' })
      expect(await cloudKeyStore.read()).toBeNull()
      expect(cloud.requests).toEqual([])
    })

    it('a person who is not a fleet admin may not read the state', async () => {
      const admin = await createUserWithRole('ADMIN')
      await expect(services['cloud.state']({ byUserId: admin.id })).rejects.toMatchObject({ code: 'not_allowed' })
    })
  })
})

withFeature('cloud', () => {
  describe('an organisation admin connects HQ to Cloud from hq @SC-1090', () => {
    const asUser = (user: { id: string }) => ({ user: { id: user.id } }) as never

    it('a member may do none of it, and Cloud is asked nothing', async () => {
      const member = await createUserWithRole('MEMBER', { fleetAdmin: true })
      await expect(getHqCloudConnection(undefined, asUser(member))).rejects.toMatchObject({ statusCode: 403 })
      await expect(connectHqToCloud(undefined, asUser(member))).rejects.toMatchObject({ statusCode: 403 })
      await expect(disconnectHqFromCloud(undefined, asUser(member))).rejects.toMatchObject({ statusCode: 403 })
      expect(cloud.requests).toEqual([])
    })

    it('an organisation admin who is not a fleet admin connects, and can drop the request', async () => {
      const admin = await createUserWithRole('ADMIN')
      expect(await getHqCloudConnection(undefined, asUser(admin))).toMatchObject({ connection: null, aiAvailable: false })
      const { connecting } = await connectHqToCloud(undefined, asUser(admin))
      expect(connecting.userCode).toMatch(/^[A-Z]{4}-[A-Z]{4}$/)
      expect((await getHqCloudConnection(undefined, asUser(admin))).connecting).toEqual(connecting)
      expect(await disconnectHqFromCloud(undefined, asUser(admin))).toEqual({ disconnected: true })
      expect(await cloudKeyStore.read()).toBeNull()
    })

    it('Cloud busy is refused with 429, saying when to try again', async () => {
      const admin = await createUserWithRole('ADMIN')
      cloud.answerNextWith({ status: 429, body: { error: 'too_many_requests' }, headers: { 'retry-after': '0' } })
      await expect(connectHqToCloud(undefined, asUser(admin))).rejects.toMatchObject({ statusCode: 429, message: 'Agenthix Cloud is busy — try again in 1 minute.' })
    })

    it('refuses disconnecting on an HQ that Cloud runs', async () => {
      vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
      const admin = await createUserWithRole('ADMIN')
      await expect(disconnectHqFromCloud(undefined, asUser(admin))).rejects.toMatchObject({ statusCode: 409 })
    })
  })
})

withFeature('cloud', () => {
  describe('an HQ that Agenthix Cloud runs @SC-1123', () => {
    const services = cloudConsoleServices()

    it('says so when its host service told it, and its connection cannot be dropped from the Fleet Console', async () => {
      vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
      const sam = await createUserWithRole('ADMIN', { fleetAdmin: true })
      expect((await services['cloud.state']({ byUserId: sam.id })).runByCloud).toBe(true)
      await expect(services['cloud.disconnect']({ byUserId: sam.id })).rejects.toMatchObject({ code: 'not_allowed' })
      expect(cloud.requests).toEqual([])
    })
  })
})

withFeature('cloud', () => {
  describe('Cloud connecting an HQ it runs, with no code @SC-1124', () => {
    const services = cloudConsoleServices()

    it('is refused where the host service has not said Cloud runs HQ, and asks nothing of Cloud', async () => {
      await expect(cloudConnectionKey()).rejects.toThrow(/does not run this HQ/)
      await expect(connectByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })).rejects.toThrow(/does not run this HQ/)
      expect(await cloudKeyStore.read()).toBeNull()
      expect(cloud.requests).toEqual([])
    })

    it('keeps the key encrypted, connects once Cloud registered it, and records it', async () => {
      vi.stubEnv('HQ_RUN_BY_CLOUD', 'true')
      const { publicKey, clientId, hqAddress } = await cloudConnectionKey()
      expect((await cloudKeyStore.read())?.publicKey).toBe(publicKey)
      cloud.registerForOrganisation(publicKey, clientId, hqAddress)
      expect(await connectByCloud({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })).toMatchObject({ cloudOrganisationId: 'org_42', name: 'Acme Robotics' })
      expect(await cloudConnectionStore.read()).toMatchObject({ cloudOrganisationId: 'org_42', clientId })
      expect(await prisma.fleetActivity.findFirst({ where: { action: 'cloud.connected' } })).toMatchObject({ byUserId: null, subject: 'Acme Robotics' })
      const sam = await createUserWithRole('ADMIN', { fleetAdmin: true })
      expect(await services['cloud.state']({ byUserId: sam.id })).toMatchObject({ connection: { name: 'Acme Robotics' }, runByCloud: true })
    })
  })
})
