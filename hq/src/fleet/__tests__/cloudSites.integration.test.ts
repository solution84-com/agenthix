/**
 * The sites Agenthix Cloud runs (pre-release spec B6; adr-0115), added and retired through the command the host service
 * on hq's machine sends over hq's control socket, against the real test database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { withFeature } from '../../test/withFeature'
import { ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { revoke: () => {}, isOnline: () => false, get: () => null }, ChannelRequestFailed }
})

import { runHqMachineCommand } from '../../auth/machine/hqMachineCommands'
import { registerSite } from '../siteCredentials'
import { authenticateSite } from '../../sites/registrationService'
import { hashCredential } from '../../sites/credentials'
import { readSiteFacts } from '../../sites/siteFacts'
import { siteIsCloud } from '../../sites/siteFigures'

const CREDENTIAL = 'smc_from_cloud_host_service_0123456789abcdef'
const register = (machineId: string, name: string, credential = CREDENTIAL) =>
  runHqMachineCommand('cloud-site-register', [machineId, name, hashCredential(credential)])
const idOf = (r: unknown) => (r as { data: { executionSiteId: string } }).data.executionSiteId

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Test org' } })
})

describe('Cloud\'s site commands while Agenthix Cloud is off, as shipped (adr-0189) @SC-2123', () => {
  it('refuses to register a site and makes none', async () => {
    expect(await register('machine-1', 'cloud-site-1')).toMatchObject({ ok: false, code: 'not_found' })
    expect(await prisma.executionSite.count({ where: { cloudMachineId: 'machine-1' } })).toBe(0)
  })
})

withFeature('cloud', () => {
  describe('site.register from Cloud @SC-1097', () => {
    it("takes the credential by its hash, shows the site as Cloud's, and lets the site in by it", async () => {
      const r = await register('machine-1', 'cloud-site-1')
      expect(r).toMatchObject({ ok: true, data: { executionSiteId: expect.any(String) } })
      const row = await prisma.executionSite.findUniqueOrThrow({ where: { id: idOf(r) } })
      expect(row).toMatchObject({ label: 'cloud-site-1', status: 'REGISTERED', cloudMachineId: 'machine-1', relayHostId: null, isDefault: false })
      expect(row.credentialHash).toBe(hashCredential(CREDENTIAL))
      expect(JSON.stringify(row)).not.toContain(CREDENTIAL)
      const [facts] = (await readSiteFacts({ id: row.id }))
      expect(siteIsCloud(facts)).toBe(true)
      expect(await authenticateSite('cloud-own-id', 'wrong')).toBeNull()
      expect(await authenticateSite('cloud-own-id', CREDENTIAL)).toMatchObject({ id: row.id, siteId: 'cloud-own-id' })
    })

    it('answers the same site for the same machine and changes nothing', async () => {
      const first = idOf(await register('machine-1', 'cloud-site-1'))
      const before = await prisma.executionSite.findUniqueOrThrow({ where: { id: first } })
      expect(idOf(await register('machine-1', 'cloud-site-1'))).toBe(first)
      expect(idOf(await register('machine-1', 'renamed', 'smc_another_credential_0123456789abcdef'))).toBe(first)
      expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: first } })).toEqual(before)
      expect(await prisma.executionSite.count()).toBe(1)
    })

    it("is a conflict when another site has that name, or the credential is another site's", async () => {
      await register('machine-1', 'cloud-site-1')
      expect(await register('machine-2', 'Cloud-Site-1', 'smc_other_0123456789abcdef0123456789')).toMatchObject({ ok: false, code: 'conflict' })
      expect(await register('machine-2', 'cloud-site-2')).toMatchObject({ ok: false, code: 'conflict' })
      const hqSite = await ensureExecutionSite()
      expect(await runHqMachineCommand('cloud-site-register', ['machine-3', 'cloud-site-3', hqSite.credentialHash!])).toMatchObject({ ok: false, code: 'conflict' })
      expect(await prisma.executionSite.count({ where: { cloudMachineId: { not: null } } })).toBe(1)
    })

    it('refuses what is not a SHA-256 hash, or an empty name', async () => {
      expect(await runHqMachineCommand('cloud-site-register', ['machine-1', 'cloud-site-1', CREDENTIAL])).toMatchObject({ ok: false, code: 'usage' })
      expect(await runHqMachineCommand('cloud-site-register', ['machine-1', '', hashCredential(CREDENTIAL)])).toMatchObject({ ok: false, code: 'usage' })
      expect(await prisma.executionSite.count()).toBe(0)
    })
  })

  describe('site.unregister from Cloud @SC-1097', () => {
    it('retires the site and forgets its credential, and is safe to repeat', async () => {
      const id = idOf(await register('machine-1', 'cloud-site-1'))
      await authenticateSite('cloud-own-id', CREDENTIAL)
      expect(await runHqMachineCommand('cloud-site-unregister', [id])).toMatchObject({ ok: true, data: { removed: true } })
      const row = await prisma.executionSite.findUniqueOrThrow({ where: { id } })
      expect(row).toMatchObject({ status: 'REVOKED', credentialHash: null })
      expect(await authenticateSite('cloud-own-id', CREDENTIAL)).toBeNull()
      expect(await runHqMachineCommand('cloud-site-unregister', [id])).toMatchObject({ ok: true, data: { removed: false } })
    })

    it('lets the same machine register again, its site taking back its own id', async () => {
      const first = idOf(await register('machine-1', 'cloud-site-1'))
      await authenticateSite('cloud-own-id', CREDENTIAL)
      await runHqMachineCommand('cloud-site-unregister', [first])
      const again = 'smc_new_credential_after_registering_again_01'
      const second = idOf(await register('machine-1', 'cloud-site-1', again))
      expect(second).not.toBe(first)
      expect(await authenticateSite('cloud-own-id', again)).toMatchObject({ id: second, siteId: 'cloud-own-id' })
    })

    it("never touches a site that is not Cloud's", async () => {
      const hqSite = await ensureExecutionSite()
      const host = await prisma.relayHost.create({
        data: { fingerprint: 'e'.repeat(64), signingKey: 'k', sealingKey: 'k', machineName: 'office-server', consoleFingerprint: 'm'.repeat(64) },
      })
      const added = await registerSite({ hostId: host.id, credentialHash: hashCredential('smc_fleet_console_site_0123456789abcd') })
      for (const id of [hqSite.id, added.executionSiteId, 'no-such-site']) {
        expect(await runHqMachineCommand('cloud-site-unregister', [id])).toMatchObject({ ok: false, code: 'not_found' })
      }
      expect(await prisma.executionSite.count({ where: { status: 'REVOKED' } })).toBe(0)
    })
  })
})
