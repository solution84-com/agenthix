/**
 * A restored site's credential renewed against the real test database (adr-0119): the credential and the machine
 * change together, the code's confirmation is spent, the old credential is refused from then on, and every fleet
 * admin and organisation admin is told. The live connections are stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

const live = vi.hoisted(() => ({ sites: new Set<string>(), hosts: new Set<string>(), closed: [] as string[] }))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return {
    siteChannelRegistry: {
      revoke: () => {}, get: () => null, isOnline: (id: string) => live.sites.has(id), closeForRotation: (id: string) => { live.closed.push(id) },
    },
    ChannelRequestFailed,
  }
})
vi.mock('../../sites/content', () => ({ contentChannelRegistry: { current: () => null, closeForRotation: () => {} } }))
vi.mock('../index', () => ({ relayHub: { isHostOnline: (id: string) => live.hosts.has(id) } }))

import { registerSite } from '../siteCredentials'
import { authenticateSite } from '../../sites/registrationService'
import { replacedSiteAt } from '../replacedSite'
import { hashCredential } from '../../sites/credentials'
import { renewRestoredSite } from '../siteRestore'
import { siteRestoreDeps } from '../siteRestoreApi'

const BACKUP = 'b'.repeat(64)
const NEW = 'n'.repeat(64)

const machine = (fp: string, credential: string) => prisma.relayHost.create({
  data: { fingerprint: fp.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: `machine-${fp}`, consoleFingerprint: 'm'.repeat(64), credentialHash: hashCredential(credential) },
})

let oldHost: string
let newHost: string
let executionSiteId: string
let siteId: string

async function confirmedToRestore(hostId: string, site: string) {
  return prisma.relayJoin.create({
    data: { lookupHash: `${hostId}-${site}`.padEnd(64, '0'), purpose: { kind: 'restoreSite', siteId: site }, expiresAt: new Date(Date.now() + 3600_000), state: 'ACCEPTED', relayHostId: hostId },
  })
}

const renew = (siteCredential: string, machineCredential: string, body: unknown) =>
  renewRestoredSite({ siteCredential, machineCredential, body }, siteRestoreDeps())

beforeEach(async () => {
  live.sites.clear()
  live.hosts.clear()
  live.closed.length = 0
  await prisma.org.create({ data: { name: 'Test org' } })
  oldHost = (await machine('a', 'hmc_old_0123456789abcdef')).id
  newHost = (await machine('b', 'hmc_new_0123456789abcdef')).id
  ;({ executionSiteId } = await registerSite({ hostId: oldHost, credentialHash: hashCredential(BACKUP) }))
  siteId = (await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })).siteId
})

describe('renewing a restored site @SC-928', () => {
  it('moves the site to the confirmed machine under its new credential, once, and tells both roles', async () => {
    const admin = await createUserWithRole('ADMIN')
    const join = await confirmedToRestore(newHost, executionSiteId)
    expect(await renew(BACKUP, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential(NEW) })).toEqual({ status: 200, body: { executionSiteId, siteName: 'machine-b' } })

    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })).toMatchObject({ siteId, credentialHash: hashCredential(NEW), relayHostId: newHost, label: 'machine-b' })
    expect(await prisma.relayJoin.findUniqueOrThrow({ where: { id: join.id } })).toMatchObject({ state: 'USED' })
    expect(await authenticateSite(siteId, BACKUP)).toBeNull()
    expect(await authenticateSite(siteId, NEW)).toMatchObject({ id: executionSiteId })
    // The old machine's copy, presenting the backup's credential, is told it was replaced; nothing else is.
    expect(await replacedSiteAt(siteId, BACKUP)).toBeInstanceOf(Date)
    expect(await replacedSiteAt(siteId, NEW)).toBeNull()
    expect(await replacedSiteAt(siteId, 'hmc_wrong_0123456789abcdef')).toBeNull()
    expect(live.closed).toEqual([siteId])
    expect(await prisma.fleetActivity.findFirst({ where: { action: 'site.restored' } })).toMatchObject({ subject: 'machine-a now runs on machine-b, and is named machine-b', announced: true })
    expect(await prisma.notification.findFirst({ where: { userId: admin.id } })).toMatchObject({ title: 'machine-a was restored on machine-b from a backup' })

    // The machine that comes back with the backup's credential, and a second use of the code, are refused.
    expect(await renew(BACKUP, 'hmc_old_0123456789abcdef', { credentialHash: hashCredential('x'.repeat(64)) })).toMatchObject({ status: 401 })
    expect(await renew(NEW, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential('y'.repeat(64)) })).toMatchObject({ status: 409 })
  })

  it('changes nothing while the site is connected, or its machine is', async () => {
    await confirmedToRestore(newHost, executionSiteId)
    live.sites.add(siteId)
    expect(await renew(BACKUP, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential(NEW) })).toMatchObject({ status: 409 })
    live.sites.clear()
    live.hosts.add(oldHost)
    expect(await renew(BACKUP, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential(NEW) })).toMatchObject({ status: 409 })
    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })).toMatchObject({ credentialHash: hashCredential(BACKUP), relayHostId: oldHost })
    expect(await replacedSiteAt(siteId, BACKUP)).toBeNull()
  })

  it('refuses a machine confirmed for another purpose, or for another site', async () => {
    await prisma.relayJoin.create({
      data: { lookupHash: 'c'.repeat(64), purpose: { kind: 'add' }, expiresAt: new Date(Date.now() + 3600_000), state: 'ACCEPTED', relayHostId: newHost },
    })
    expect(await renew(BACKUP, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential(NEW) })).toMatchObject({ status: 409 })
    await confirmedToRestore(newHost, 'another-site')
    expect(await renew(BACKUP, 'hmc_new_0123456789abcdef', { credentialHash: hashCredential(NEW) })).toMatchObject({ status: 409 })
    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })).toMatchObject({ credentialHash: hashCredential(BACKUP) })
  })
})
