// A fleet admin disconnects a site in the Fleet Console (host-management spec
// §6, §10): `site.remove` takes the site out of hq at once and the site
// reports itself not connected; `host.disconnect` closes the machine's link
// and its credential is refused from then on. Runs straight after
// 01-registration, which leaves the site added and ONLINE and the machine's
// keys saved, and puts that state back at the end: the machine is connected
// anew and its site added again, so 02-dispatch and 03-heldTasks find what
// they expect. (HQ's own site cannot be removed — 04-pairing checks that.)
import { createHash } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { until } from './harness/hqApi'
import { startSite, stopSite, waitForSite } from './harness/apps'
import { runSiteCommand } from './harness/siteCommand'
import {
  StandInHost, StandInConsole, addSiteThroughFleetConsole, loadJoinedMachine, saveJoinedMachine,
} from './harness/fleetConsole'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

let fleetConsole: StandInConsole
let host: StandInHost

afterAll(() => {
  fleetConsole?.close()
  host?.link?.close()
})

async function connectedAgain(executionSiteId: string): Promise<{ siteId: string }> {
  await until(async () => {
    const s = await runSiteCommand(['status'])
    return /Status:\s+Connected/.test(s.stdout) ? s : null
  }, 'the site to report itself connected again', 90_000)
  return until(async () => {
    const row = await hqDb.executionSite.findUnique({ where: { id: executionSiteId } })
    return row?.status === 'ONLINE' ? row : null
  }, 'hq to see the site added again ONLINE', 60_000)
}

describe('a site is disconnected in the Fleet Console, over the real path', () => {
  it('removing the site: hq drops it at once, keeps its row, and the site reports itself not connected', async () => {
    const machine = loadJoinedMachine()
    fleetConsole = await StandInConsole.connect(machine.consoleKeys)

    // Starting point left by 01-registration: one added site, ONLINE, not the default.
    const site = await hqDb.executionSite.findUniqueOrThrow({ where: { id: machine.executionSiteId } })
    expect(site).toMatchObject({ status: 'ONLINE', isDefault: false })

    expect(await fleetConsole.call('site.remove', { executionSiteId: site.id })).toEqual({ removed: true })
    await until(async () => {
      const row = await hqDb.executionSite.findUnique({ where: { id: site.id } })
      return row?.status === 'REVOKED' ? row : null
    }, 'hq to mark the site REVOKED', 30_000)
    // The row is kept, not deleted — its history stays with hq.
    expect(await hqDb.executionSite.count({ where: { id: site.id } })).toBe(1)

    // hq closed the site's channel with its refusal, so the site says why in words.
    const status = await until(async () => {
      const s = await runSiteCommand(['status'])
      return /Status:\s+Not connected\. HQ no longer accepts this site's credential/.test(s.stdout) ? s : null
    }, 'the site to report itself not connected', 30_000)
    expect(status.code).toBe(0)

    // Nothing left to remove.
    expect(await fleetConsole.call('site.remove', { executionSiteId: site.id })).toEqual({ removed: false })
  })

  it('disconnecting the machine: its link closes at once, and its credential is refused from then on', async () => {
    const machine = loadJoinedMachine()
    host = StandInHost.restore(machine)
    const link = await host.connect()
    await until(async () => {
      const { hosts } = await fleetConsole.call('host.list', {})
      return hosts.find((h: { hostId: string; online: boolean }) => h.hostId === machine.hostId && h.online)
    }, 'the machine to be online in the Fleet Console', 30_000)

    expect(await fleetConsole.call('host.disconnect', { hostId: machine.hostId })).toEqual({ disconnected: true })
    await link.next('revoke')
    expect(await link.closed).toBe(4003)

    await expect(host.connect()).rejects.toMatchObject({ status: 401 })
    const { hosts } = await fleetConsole.call('host.list', {})
    expect(hosts.map((h: { hostId: string }) => h.hostId)).not.toContain(machine.hostId)
    const relayHost = await hqDb.relayHost.findUniqueOrThrow({ where: { id: machine.hostId } })
    expect(relayHost.credentialHash).toBeNull()
    expect(relayHost.disconnectedAt).not.toBeNull()
  })

  it(
    'the machine is connected anew with a new code, and a fresh install of its site takes part with a new credential',
    async () => {
      const before = loadJoinedMachine()
      const previousSiteId = (await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })).siteId

      // The same machine — the same keys — joins again; hq knows it by its fingerprint.
      host = new StandInHost(before.hostKeys, before.machineName)
      const machine = await addSiteThroughFleetConsole(fleetConsole, host)
      expect(machine.hostId).toBe(before.hostId)
      expect(machine.machineCredential).not.toBe(before.machineCredential)
      expect(machine.executionSiteId).not.toBe(before.executionSiteId)
      saveJoinedMachine(machine)

      // A site installed from nothing: its database starts empty, so it has an id of its own. (Kept data: the
      // skipped test below.)
      await stopSite()
      await siteDb.hqConnection.deleteMany()
      await siteDb.siteConfig.deleteMany()
      await startSite({ pairingSecret: machine.siteCredential, hqUrl: HQ_URL })
      await waitForSite()

      const back = await connectedAgain(machine.executionSiteId)
      const siteConfig = await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })
      expect(back.siteId).toBe(siteConfig.siteId)
      expect(back.siteId).not.toBe(previousSiteId)
      expect(await hqDb.executionSite.count({ where: { status: { not: 'REVOKED' } } })).toBe(1)
      const added = await hqDb.executionSite.findUniqueOrThrow({ where: { id: machine.executionSiteId } })
      expect(added.credentialHash).toBe(sha256(machine.siteCredential))
    },
    300_000,
  )

  it(
    'a site removed and added again on the same machine, its data kept, takes part again with a new credential',
    async () => {
      const before = loadJoinedMachine()
      const siteId = (await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })).siteId
      expect(await fleetConsole.call('site.remove', { executionSiteId: before.executionSiteId })).toEqual({ removed: true })

      const serving = host.serveSiteInstall()
      const result = await fleetConsole.command(host.keys.identity, { op: 'install', target: 'site', version: '0.0.0' })
      const siteCredential = await serving
      const credentialHash = result.ok ? (result.result as { credentialHash?: string }).credentialHash : undefined
      const { executionSiteId } = await fleetConsole.call('site.register', { hostId: before.hostId, credentialHash })
      saveJoinedMachine({ ...before, siteCredential, executionSiteId })

      await stopSite()
      await startSite({ pairingSecret: siteCredential, hqUrl: HQ_URL })
      await waitForSite()
      const back = await connectedAgain(executionSiteId)
      expect(back.siteId).toBe(siteId)
    },
    300_000,
  )
})
