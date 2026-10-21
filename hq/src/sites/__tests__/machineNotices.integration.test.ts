import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// What fleet admins are asked about the machines in the fleet (host-management spec §6, §10), against the real test
// database: a machine that left by itself, and one not heard from for 10 minutes. The live channels are replaced.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../channel', () => ({ siteChannelRegistry: { revoke: vi.fn() } }))
vi.mock('../content', () => ({ contentChannelRegistry: { revoke: vi.fn() } }))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../fleet/index', () => ({ relayHub: { revokeHost: vi.fn(() => false) } }))
vi.mock('../siteNotifications', () => ({ reconcileSiteNotifications: vi.fn(async () => {}), SITES_PAGE_URL: '/org/settings/where-work-runs' }))

import { FLEET_MACHINE_NOTIFICATION_TYPES as T } from '../../notifications/notificationKinds'
import { reconcileMachineNotices, __setMachinePresenceForTests } from '../machineNotices'
import { siteLeaveHandler } from '../leaveApi'
import { hostLeaveHandler } from '../machineLeaveApi'
import { authenticateHost, connectedHosts, disconnectHost, knownHost } from '../../fleet/hosts'
import { relayHub } from '../../fleet/index'
import { generateCredential, hashCredential } from '../credentials'

type Handler = (req: unknown, res: unknown, ctx: unknown) => Promise<void>
const leave = siteLeaveHandler as unknown as Handler
const hostLeave = hostLeaveHandler as unknown as Handler
function response() {
  const r = { code: 0, body: undefined as unknown, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}

const longAgo = new Date(Date.now() - 24 * 3600_000)
const online = new Set<string>()
const presence = { onlineSince: (hostId: string) => (online.has(hostId) ? new Date() : null) }

let seq = 0
async function machine(lastSeenAt: Date | null = new Date()) {
  seq++
  const host = await prisma.relayHost.create({
    data: {
      fingerprint: `fp-${seq}`, signingKey: 's', sealingKey: 'k', machineName: `machine-${seq}`, consoleFingerprint: 'm',
      credentialHash: hashCredential(`hmc-${seq}`), joinedAt: longAgo, lastSeenAt,
    },
  })
  const credential = generateCredential('smc').value
  const site = await prisma.executionSite.create({
    data: { siteId: `site-${seq}`, label: host.machineName, status: 'ONLINE', credentialHash: hashCredential(credential), relayHostId: host.id },
  })
  return { host, site, credential }
}

const open = (type: string) => prisma.notification.findMany({ where: { type, status: { in: ['unread', 'read'] } } })

let fleetAdmin: { id: string }
beforeEach(async () => {
  online.clear()
  __setMachinePresenceForTests(presence, longAgo)
  await prisma.org.create({ data: { name: 'Test org' } })
  fleetAdmin = await createUserWithRole('ADMIN', { fleetAdmin: true })
})

describe('a machine that disconnects itself tells HQ it left (spec §6) @SC-930', () => {
  it('is known by its site’s credential alone, which retires that site and nothing else', async () => {
    const { site, credential } = await machine()
    const other = await machine()
    const r = response()
    await leave({ headers: { authorization: `Bearer ${credential}` } }, r, {})
    expect(r.code).toBe(200)
    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).toMatchObject({ status: 'REVOKED', leftByItself: true })
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: other.site.id } })).status).toBe('ONLINE')
  })

  it('refuses a credential HQ does not know, with no site id, and changes nothing', async () => {
    const { site } = await machine()
    const r = response()
    await leave({ headers: { authorization: 'Bearer smc_not_one_of_ours' } }, r, {})
    expect(r.code).toBe(401)
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('ONLINE')
  })

  it('shows the machine as left by itself, and asks fleet admins to remove it until it is removed', async () => {
    const { host, site, credential } = await machine(longAgo)
    await leave({ headers: { authorization: `Bearer ${credential}` } }, response(), {})
    expect((await connectedHosts()).find(h => h.hostId === host.id)?.leftAt).toBeInstanceOf(Date)
    await reconcileMachineNotices()
    expect(await open(T.left)).toMatchObject([{
      userId: fleetAdmin.id, subjectKey: host.id, title: `${host.machineName} left the fleet`, body: 'Disconnected on the machine itself.',
      actionLabel: 'Remove it in the Fleet Console', actionUrl: `/org/settings/where-work-runs/${site.id}`, dismissible: false,
    }])
    // Not also as not heard from, though its link has been silent for a day.
    expect(await open(T.notHeardFrom)).toEqual([])

    await disconnectHost(host.id)
    await reconcileMachineNotices()
    expect(await open(T.left)).toEqual([])
  })
})

describe('a machine that disconnects itself says so with its machine credential, site or none (spec §6) @SC-930', () => {
  async function bare(lastSeenAt: Date | null = longAgo) {
    seq++
    const credential = `hmc-bare-${seq}`
    const host = await prisma.relayHost.create({
      data: {
        fingerprint: `fp-bare-${seq}`, signingKey: 's', sealingKey: 'k', machineName: `machine-bare-${seq}`, consoleFingerprint: 'm',
        credentialHash: hashCredential(credential), joinedAt: longAgo, lastSeenAt,
      },
    })
    return { host, credential }
  }

  it('marks a machine with no site as left by itself, ends its link, and asks fleet admins to remove it', async () => {
    const { host, credential } = await bare()
    const other = await bare()
    const r = response()
    await hostLeave({ headers: { authorization: `Bearer ${credential}` } }, r, {})
    expect(r.code).toBe(200)
    expect(relayHub.revokeHost).toHaveBeenCalledWith(host.id)
    const listed = await connectedHosts()
    expect(listed.find(h => h.hostId === host.id)?.leftAt).toBeInstanceOf(Date)
    expect(listed.find(h => h.hostId === other.host.id)?.leftAt).toBeNull()
    expect(await authenticateHost(credential)).toBeNull()
    expect(await knownHost(host.fingerprint)).toBeNull()
    await reconcileMachineNotices()
    expect(await open(T.left)).toMatchObject([{
      userId: fleetAdmin.id, subjectKey: host.id, title: `${host.machineName} left the fleet`, actionUrl: '/org/settings/where-work-runs',
    }])
    expect((await open(T.notHeardFrom)).map(n => n.subjectKey)).toEqual([other.host.id])

    await disconnectHost(host.id)
    await reconcileMachineNotices()
    expect(await open(T.left)).toEqual([])
  })

  it('changes nothing about the machine’s site: only the site’s own credential retires it', async () => {
    const { host, site } = await machine()
    const r = response()
    await hostLeave({ headers: { authorization: `Bearer hmc-${seq}` } }, r, {})
    expect(r.code).toBe(200)
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('ONLINE')
    expect((await connectedHosts()).find(h => h.hostId === host.id)?.leftAt).toBeInstanceOf(Date)
  })

  it('keeps the first time when said again, and refuses a credential HQ does not know or no credential', async () => {
    const { host, credential } = await bare()
    await hostLeave({ headers: { authorization: `Bearer ${credential}` } }, response(), {})
    const first = (await prisma.relayHost.findUniqueOrThrow({ where: { id: host.id } })).leftAt
    const again = response()
    await hostLeave({ headers: { authorization: `Bearer ${credential}` } }, again, {})
    expect(again.code).toBe(200)
    expect((await prisma.relayHost.findUniqueOrThrow({ where: { id: host.id } })).leftAt).toEqual(first)
    for (const headers of [{ authorization: 'Bearer hmc_not_one_of_ours' }, {}]) {
      const r = response()
      await hostLeave({ headers }, r, {})
      expect(r.code).toBe(401)
    }
    await disconnectHost(host.id)
    const removed = response()
    await hostLeave({ headers: { authorization: `Bearer ${credential}` } }, removed, {})
    expect(removed.code).toBe(401)
  })

  it('refuses the machine that carries HQ’s own site', async () => {
    const { host, credential } = await bare()
    await prisma.executionSite.create({
      data: { siteId: `site-default-${seq}`, label: 'hq', status: 'ONLINE', isDefault: true, credentialHash: hashCredential('x'), relayHostId: host.id },
    })
    const r = response()
    await hostLeave({ headers: { authorization: `Bearer ${credential}` } }, r, {})
    expect(r.code).toBe(409)
    expect((await prisma.relayHost.findUniqueOrThrow({ where: { id: host.id } })).leftAt).toBeNull()
  })
})

describe('a machine not heard from for 10 minutes (spec §10) @SC-929', () => {
  it('asks fleet admins only, whether or not work waits on it, and clears when it connects again', async () => {
    const member = await createUserWithRole('MEMBER')
    const orgAdminOnly = await createUserWithRole('ADMIN')
    const { host } = await machine(new Date(Date.now() - 11 * 60_000))
    await reconcileMachineNotices()
    const raised = await open(T.notHeardFrom)
    expect(raised.map(n => n.userId)).toEqual([fleetAdmin.id])
    expect(raised[0]).toMatchObject({ subjectKey: host.id, actionLabel: 'Open in the Fleet Console', dismissible: false })
    expect(raised[0].title).toMatch(new RegExp(`^Not heard from ${host.machineName} since `))
    expect(raised.some(n => n.userId === member.id || n.userId === orgAdminOnly.id)).toBe(false)

    online.add(host.id)
    await reconcileMachineNotices()
    expect(await open(T.notHeardFrom)).toEqual([])
  })

  it('raises nothing for a machine heard from less than 10 minutes ago, or connected now', async () => {
    await machine(new Date(Date.now() - 5 * 60_000))
    const { host } = await machine(longAgo)
    online.add(host.id)
    await reconcileMachineNotices()
    expect(await open(T.notHeardFrom)).toEqual([])
  })

  it('gives every machine 10 minutes after HQ starts before asking, and keeps one already open meanwhile', async () => {
    await machine(longAgo)
    await reconcileMachineNotices()
    expect(await open(T.notHeardFrom)).toHaveLength(1)
    __setMachinePresenceForTests(presence, new Date())
    await reconcileMachineNotices()
    expect(await open(T.notHeardFrom)).toHaveLength(1)
  })

  it('stops asking about a machine removed from the fleet', async () => {
    const { host } = await machine(longAgo)
    await reconcileMachineNotices()
    await disconnectHost(host.id)
    await reconcileMachineNotices()
    expect(await open(T.notHeardFrom)).toEqual([])
  })
})
