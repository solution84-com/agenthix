// The default site: connected by configuration, not registration. One secret
// (HQ_PAIRING_SECRET) in hq's and the site's environment — no command, no code,
// no approval. Runs after 03 (filename order): it tears the pair the earlier
// suites built down to nothing, resets both test databases, and boots both apps
// again from the secret alone. The harness blanks the secret for every other
// boot (harness/apps.ts), so 00-03 keep adding their site through the Fleet
// Console. Leaves the pair running for 05-relay; globalSetup's teardown stops it.
import { describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb, truncateAll, seedUsers } from './harness/db'
import { login, op, until } from './harness/hqApi'
import { startHq, startSite, stopHq, stopSite, waitForHq, waitForSite } from './harness/apps'
import { runSiteCommand } from './harness/siteCommand'
import { StandInConsole } from './harness/fleetConsole'

// Fixed test value, 64 hex characters (the shape of `openssl rand -hex 32`).
// Only ever used against the harness's own test databases.
const PAIRING_SECRET = 'c0ffee00'.repeat(8)

type SiteRow = { id: string; siteId: string; status: string; isDefault: boolean; credentialHash: string | null }

async function onlyDefaultRow(): Promise<SiteRow | null> {
  const rows: SiteRow[] = await hqDb.executionSite.findMany()
  if (rows.length !== 1) return null
  return rows[0].isDefault && rows[0].status === 'ONLINE' ? rows[0] : null
}

describe('hq’s default site is connected by a shared secret, with no registration', () => {
  it(
    'a fresh hq and site given the same HQ_PAIRING_SECRET come up connected, and hq holds one default site and one org',
    async () => {
      expect(PAIRING_SECRET).toMatch(/^[0-9a-f]{64}$/)

      await Promise.all([stopHq(), stopSite()])
      // Both databases back to empty. Only the accounts are seeded: the Org
      // must be created by hq itself at boot, which is what is asserted below.
      await truncateAll()
      await seedUsers()
      expect(await hqDb.org.count()).toBe(0)
      expect(await hqDb.executionSite.count()).toBe(0)

      await startHq({ pairingSecret: PAIRING_SECRET })
      await waitForHq()
      expect(await hqDb.org.count()).toBe(1)
      const created: SiteRow[] = await hqDb.executionSite.findMany()
      expect(created).toHaveLength(1)
      expect(created[0].isDefault).toBe(true)
      expect(created[0].credentialHash).not.toBeNull()
      // The secret itself is never stored — only its hash.
      expect(created[0].credentialHash).not.toContain(PAIRING_SECRET)

      // No `register` command anywhere below: the site is given the secret and
      // hq's address in its environment and nothing else.
      await startSite({ pairingSecret: PAIRING_SECRET, hqUrl: HQ_URL })
      await waitForSite()

      const online = await until(onlyDefaultRow, 'hq to hold exactly one default site, ONLINE', 180_000)
      const siteConfig = await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })
      expect(online.siteId).toBe(siteConfig.siteId)

      const status = await until(async () => {
        const s = await runSiteCommand(['status'])
        return /Status:\s+Connected/.test(s.stdout) ? s : null
      }, 'the site to report itself connected', 60_000)
      expect(status.code).toBe(0)
    },
    600_000,
  )

  it('an admin sees the site as the default, and the Fleet Console cannot remove it', async () => {
    const admin = await login('e2e-admin', 'E2eAdmin!2026')

    const listed = await op(HQ_URL, 'get-execution-sites', undefined, admin)
    expect(listed.status).toBe(200)
    expect(listed.json).toHaveLength(1)
    expect(listed.json[0].isDefault).toBe(true)
    expect(listed.json[0].status).toBe('ONLINE')
    // The list never carries the credential, hashed or not.
    expect(JSON.stringify(listed.json)).not.toMatch(/credential/i)

    const fleetConsole = await StandInConsole.connect()
    try {
      const refused = await fleetConsole.ask('site.remove', { executionSiteId: listed.json[0].id })
      expect(refused).toMatchObject({ ok: false, code: 'not_allowed' })
    } finally {
      fleetConsole.close()
    }

    const row = await hqDb.executionSite.findUniqueOrThrow({ where: { id: listed.json[0].id } })
    expect(row.status).toBe('ONLINE')
  })

  it(
    'a site whose database is wiped is rebuilt from the same secret, and hq adopts its new id on the one default row',
    async () => {
      const before = await hqDb.executionSite.findFirstOrThrow({ where: { isDefault: true } })
      const previousSiteId = (await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })).siteId
      expect(before.siteId).toBe(previousSiteId)

      // Stopped first, so nothing rewrites the rows while they are being wiped.
      await stopSite()
      await siteDb.hqConnection.deleteMany()
      await siteDb.siteConfig.deleteMany()
      expect(await siteDb.hqConnection.count()).toBe(0)
      expect(await siteDb.siteConfig.count()).toBe(0)

      await startSite({ pairingSecret: PAIRING_SECRET, hqUrl: HQ_URL })
      await waitForSite()

      const rebuilt = await until(async () => {
        const row = await onlyDefaultRow()
        return row && row.siteId !== previousSiteId ? row : null
      }, 'hq to adopt the rebuilt site’s new id on the one default row, ONLINE', 180_000)

      const newConfig = await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })
      expect(newConfig.siteId).not.toBe(previousSiteId)
      expect(rebuilt.siteId).toBe(newConfig.siteId)
      // Same row (adopted, not re-created), still the only one.
      expect(rebuilt.id).toBe(before.id)
      expect(await hqDb.executionSite.count()).toBe(1)
      expect(await siteDb.hqConnection.count()).toBe(1)

      const status = await until(async () => {
        const s = await runSiteCommand(['status'])
        return /Status:\s+Connected/.test(s.stdout) ? s : null
      }, 'the rebuilt site to report itself connected', 60_000)
      expect(status.code).toBe(0)
    },
    600_000,
  )
})
