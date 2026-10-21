// Adding a site through the Fleet Console, over the real paths (host-management
// spec §6, *Connecting a machine*): a stand-in Fleet Console and host service
// (harness/fleetConsole.ts) join the machine through hq's two links, the host
// service makes the site's credential, the Fleet Console registers its hash
// with `site.register`, and the real site started with that credential
// connects. Runs after 00-canary and leaves the site added + ONLINE, with the
// machine's keys and credentials saved for 01b-unregister; later suites
// (02-dispatch, 03-heldTasks) build on that end state.
import { createHash } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { until } from './harness/hqApi'
import { stopHq, startHq, waitForHq, stopSite, startSite, waitForSite } from './harness/apps'
import { runSiteCommand } from './harness/siteCommand'
import {
  StandInHost, StandInConsole, addSiteThroughFleetConsole, saveJoinedMachine, type JoinedMachine,
} from './harness/fleetConsole'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

let fleetConsole: StandInConsole
let host: StandInHost
let machine: JoinedMachine

afterAll(() => {
  fleetConsole?.close()
  host?.link?.close()
})

describe('a site joins through the Fleet Console, over the real path', () => {
  it('the machine joins with a one-time code, its site is installed and registered, and both sides converge on connected', async () => {
    fleetConsole = await StandInConsole.connect()
    host = await StandInHost.create('cross-app-machine')
    machine = await addSiteThroughFleetConsole(fleetConsole, host)
    saveJoinedMachine(machine)

    // hq pinned the machine to this Fleet Console and keeps its credential only as a hash.
    const relayHost = await hqDb.relayHost.findUniqueOrThrow({ where: { id: machine.hostId } })
    expect(relayHost.fingerprint).toBe(await host.fingerprint())
    expect(relayHost.consoleFingerprint).toBe(await fleetConsole.fingerprint())
    expect(relayHost.credentialHash).toBe(sha256(machine.machineCredential))
    const { hosts } = await fleetConsole.call('host.list', {})
    expect(hosts).toEqual([expect.objectContaining({ hostId: machine.hostId, machineName: 'cross-app-machine', online: true })])

    // The site's credential never reached hq: only the hash the host service answered with.
    const registered = await hqDb.executionSite.findUniqueOrThrow({ where: { id: machine.executionSiteId } })
    expect(registered).toMatchObject({ isDefault: false, relayHostId: machine.hostId, credentialHash: sha256(machine.siteCredential) })

    // The host service starts its site with hq's address and the credential (host/src/compose/projects.ts).
    await stopSite()
    await startSite({ pairingSecret: machine.siteCredential, hqUrl: HQ_URL })
    await waitForSite()

    await until(async () => {
      const s = await runSiteCommand(['status'])
      return /Status:\s+Connected/.test(s.stdout) ? s : null
    }, 'the site to report itself connected', 90_000)
    // The row was made with a placeholder id; the site's first connection gives it the site's own.
    const siteConfig = await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })
    const online = await until(async () => {
      const row = await hqDb.executionSite.findUnique({ where: { id: machine.executionSiteId } })
      return row?.status === 'ONLINE' ? row : null
    }, 'hq to see the site ONLINE', 60_000)
    expect(online.siteId).toBe(siteConfig.siteId)
    expect(await hqDb.executionSite.count()).toBe(1)
  }, 300_000)

  it('a machine carries one site: a second credential for it is refused', async () => {
    const again = await fleetConsole.ask('site.register', {
      hostId: machine.hostId, credentialHash: sha256('another credential'),
    })
    expect(again).toMatchObject({ ok: false, code: 'not_allowed' })
    expect(await hqDb.executionSite.count()).toBe(1)
  })
})


// K3: @SC-293 moved off this describe — nothing here ever drops a live
// connection (the OFFLINE this suite observes comes from
// markAllOfflineAtBoot, hq's own boot sweep, which is SC-294's contract, not
// SC-293's). The connection-drop→OFFLINE half of SC-293 genuinely runs in
// 03-heldTasks.test.ts, via a real stopSite(); it carries the tag there now.
describe('hq restart: offline at boot, reconnect without being added again @SC-292 @SC-294', () => {
  it(
    'reconnects without being added again after hq restarts (OFFLINE at boot is the expected read; ' +
      'a same-poll ONLINE read must still prove a genuine redial, not a stale row), ' +
      'and hq never holds a site of its own',
    async () => {
      const siteConfig = await siteDb.siteConfig.findFirstOrThrow({ select: { siteId: true } })
      const before = await siteDb.hqConnection.findUniqueOrThrow({
        where: { id: 'singleton' },
        select: { connectionToken: true },
      })

      // Baseline for the ONLINE-branch genuine-redial check below. markOnline
      // (siteStatusStore.ts) stamps a fresh `lastSeenAt` on every reconnect;
      // markAllOfflineAtBoot and markOffline both write only `status`. So a
      // *stale* ONLINE row — the kind left behind if markAllOfflineAtBoot
      // were ever deleted or broken — still carries THIS exact timestamp,
      // while a *genuine* reconnect always carries a strictly newer one. Read
      // right before stopHq() so nothing between here and the restart can
      // move it first.
      const beforeRestart = await hqDb.executionSite.findUniqueOrThrow({
        where: { siteId: siteConfig.siteId },
        select: { status: true, lastSeenAt: true },
      })

      // hq creates no site of its own: the registry holds only the site this
      // suite registered, before the restart and after it.
      expect(await hqDb.executionSite.count({ where: { credentialHash: null } })).toBe(0)

      await stopHq()
      await startHq()
      await waitForHq()

      // markAllOfflineAtBoot runs during hq's setupServer(), strictly before
      // the health endpoint can answer 'ok' — so reading the registry row
      // directly via hqDb right after waitForHq() resolves is both faster
      // than the operation path and the earliest point that transient state
      // is observable. Site's redial waits out its backoff (5s-60s) before
      // trying again, so in practice this read lands well before that — but
      // if it ever doesn't (redial already back ONLINE by the time this
      // runs), that is itself proof the reconnect worked and is not treated
      // as a failure; the transient OFFLINE-at-boot just wasn't caught this
      // particular run.
      const rightAfterBoot = await hqDb.executionSite.findUniqueOrThrow({
        where: { siteId: siteConfig.siteId },
        select: { status: true, lastSeenAt: true },
      })
      if (rightAfterBoot.status === 'ONLINE') {
        // Deleting markAllOfflineAtBoot entirely would ALSO read ONLINE
        // here (the stale pre-restart row, simply never touched) — so
        // reading ONLINE alone proves nothing. The discriminator is
        // `lastSeenAt`: only a genuine reconnect (markOnline) advances it: a
        // stale row still carries the pre-restart timestamp captured in
        // `beforeRestart` above. Require the newer timestamp rather than
        // treating any ONLINE read as success.
        expect(rightAfterBoot.lastSeenAt.getTime()).toBeGreaterThan(beforeRestart.lastSeenAt.getTime())
        console.warn(
          '[01-registration] site redial reconnected before the post-boot DB read — ' +
            "markAllOfflineAtBoot's OFFLINE state was transient and not observed this run, " +
            'but the newer lastSeenAt above proves this was a genuine reconnect, not a stale row.',
        )
      } else {
        expect(rightAfterBoot.status).toBe('OFFLINE')
        // markAllOfflineAtBoot writes only `status` (siteStatusStore.ts) —
        // the boot-time sweep must leave the timestamp itself untouched.
        expect(rightAfterBoot.lastSeenAt.getTime()).toBe(beforeRestart.lastSeenAt.getTime())
      }

      await until(async () => {
        const row = await hqDb.executionSite.findUnique({
          where: { siteId: siteConfig.siteId },
          select: { status: true },
        })
        return row?.status === 'ONLINE' ? row : null
      }, 'registered site back ONLINE after hq restart (site redial backoff 5s-60s)', 180_000)

      // Closes SC-292's "last-seen advances" half. The reconnect itself is
      // the only advance this suite can reliably observe within its own
      // timescale: siteChannelServer.ts's PING_INTERVAL_MS is 30s, so a
      // steady-state read-twice-a-few-seconds-apart probe (touch() firing
      // only on each pong) would almost certainly show no change and prove
      // nothing either way — checked the real constant rather than assume a
      // few seconds would be enough. The ping/pong advance is real but not
      // exercised here; the reconnect advance below is.
      const reconnected = await hqDb.executionSite.findUniqueOrThrow({
        where: { siteId: siteConfig.siteId },
        select: { lastSeenAt: true },
      })
      expect(reconnected.lastSeenAt.getTime()).toBeGreaterThan(beforeRestart.lastSeenAt.getTime())

      const after = await siteDb.hqConnection.findUniqueOrThrow({
        where: { id: 'singleton' },
        select: { connectionToken: true },
      })
      expect(after.connectionToken).toBe(before.connectionToken)

      const remaining = await hqDb.executionSite.findMany({
        select: { id: true, siteId: true, credentialHash: true },
      })
      expect(remaining).toHaveLength(1)
      expect(remaining[0].siteId).toBe(siteConfig.siteId)
      expect(remaining[0].credentialHash).not.toBeNull()
    },
    400_000,
  )
})
