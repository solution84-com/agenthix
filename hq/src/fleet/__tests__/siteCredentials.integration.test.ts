/**
 * A site's credential, accepted and removed only by the Fleet Console (host-management spec §6 step 5, §9; adr-0115),
 * against the real test database. The organisation admin's approval and removal are refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { revoke: () => {}, isOnline: () => false, get: () => null }, ChannelRequestFailed }
})

import { registerSite, removeSite } from '../siteCredentials'
import { authenticateSite } from '../../sites/registrationService'
import { hashCredential } from '../../sites/credentials'

const CREDENTIAL = 'smc_from_the_host_service_0123456789abcdef'
let hostId: string

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Test org' } })
  const host = await prisma.relayHost.create({
    data: { fingerprint: 'e'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'office-server', consoleFingerprint: 'm'.repeat(64), credentialHash: 'h'.repeat(64) },
  })
  hostId = host.id
})

describe('site.register @SC-926', () => {
  it("is named after the machine that carries it, and a second site of that name is refused @SC-870", async () => {
    const { executionSiteId } = await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })).toMatchObject({ label: 'office-server' })
    const twin = await prisma.relayHost.create({
      data: { fingerprint: 'f'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'Office-Server', consoleFingerprint: 'm'.repeat(64) },
    })
    await expect(registerSite({ hostId: twin.id, credentialHash: hashCredential('other') })).rejects.toMatchObject({
      code: 'not_allowed', message: expect.stringContaining('A site named office-server is already in HQ'),
    })
  })

  it('lets the site in by its credential, from whatever id its own database gives it', async () => {
    const { executionSiteId } = await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    const row = await prisma.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })
    expect(row).toMatchObject({ label: 'office-server', status: 'REGISTERED', relayHostId: hostId, isDefault: false })
    expect(await authenticateSite('site-own-id', 'wrong')).toBeNull()
    expect(await authenticateSite('site-own-id', CREDENTIAL)).toMatchObject({ id: executionSiteId, siteId: 'site-own-id' })
    expect(await authenticateSite('site-own-id', CREDENTIAL)).toMatchObject({ id: executionSiteId })
  })

  it('refuses a second site on one machine, a credential already in use, and a machine not in the fleet', async () => {
    await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    await expect(registerSite({ hostId, credentialHash: hashCredential('other') })).rejects.toMatchObject({ code: 'not_allowed' })
    const other = await prisma.relayHost.create({
      data: { fingerprint: 'f'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'b', consoleFingerprint: 'm'.repeat(64) },
    })
    await expect(registerSite({ hostId: other.id, credentialHash: hashCredential(CREDENTIAL) })).rejects.toMatchObject({ code: 'not_allowed' })
    const hqSite = await ensureExecutionSite()
    await expect(registerSite({ hostId: other.id, credentialHash: hqSite.credentialHash! })).rejects.toMatchObject({ code: 'not_allowed' })
    await prisma.relayHost.update({ where: { id: other.id }, data: { disconnectedAt: new Date() } })
    await expect(registerSite({ hostId: other.id, credentialHash: hashCredential('third') })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('the credential the host service makes @SC-926', () => {
  it('is accepted on the site channel exactly as the lower-case SHA-256 hex of what the site presents', async () => {
    const { createHash, randomBytes } = await import('node:crypto')
    const credential = randomBytes(32).toString('hex')
    const credentialHash = createHash('sha256').update(credential, 'utf8').digest('hex')
    const { executionSiteId } = await registerSite({ hostId, credentialHash: credentialHash.toUpperCase() })
    expect(await authenticateSite('its-own-id', credential.toUpperCase())).toBeNull()
    expect(await authenticateSite('its-own-id', credential)).toMatchObject({ id: executionSiteId, siteId: 'its-own-id' })
  })
})

describe('site.remove @SC-926', () => {
  it('takes the site out: its credential is refused from then on', async () => {
    const { executionSiteId } = await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    await authenticateSite('site-own-id', CREDENTIAL)
    expect(await removeSite({ executionSiteId })).toEqual({ removed: true })
    expect(await authenticateSite('site-own-id', CREDENTIAL)).toBeNull()
    expect(await removeSite({ executionSiteId })).toEqual({ removed: false })
  })

  it('a site removed and added again on the same machine, its data kept, takes back its own id', async () => {
    const first = await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    await authenticateSite('site-own-id', CREDENTIAL)
    await removeSite({ executionSiteId: first.executionSiteId })

    const again = 'smc_a_new_credential_after_adding_it_again_0123'
    const second = await registerSite({ hostId, credentialHash: hashCredential(again) })
    expect(await authenticateSite('site-own-id', again)).toMatchObject({ id: second.executionSiteId, siteId: 'site-own-id' })
    const old = await prisma.executionSite.findUniqueOrThrow({ where: { id: first.executionSiteId } })
    expect(old.status).toBe('REVOKED')
    expect(old.siteId).not.toBe('site-own-id')
  })

  it('never lets a site take an id held by a site on another machine, removed or not', async () => {
    const first = await registerSite({ hostId, credentialHash: hashCredential(CREDENTIAL) })
    await authenticateSite('site-own-id', CREDENTIAL)
    await removeSite({ executionSiteId: first.executionSiteId })
    const other = await prisma.relayHost.create({
      data: { fingerprint: 'f'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'b', consoleFingerprint: 'm'.repeat(64) },
    })
    const stranger = 'smc_another_machines_credential_0123456789ab'
    await registerSite({ hostId: other.id, credentialHash: hashCredential(stranger) })
    expect(await authenticateSite('site-own-id', stranger)).toBeNull()
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: first.executionSiteId } })).siteId).toBe('site-own-id')
  })

  it('never removes hq’s own site', async () => {
    const hqSite = await ensureExecutionSite()
    await expect(removeSite({ executionSiteId: hqSite.id })).rejects.toMatchObject({ code: 'not_allowed' })
  })
})
