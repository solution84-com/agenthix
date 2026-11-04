import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUserWithRole } from '../../test/factories'

// The notifications Execution Sites raises to organisation admins (every screen
// reviewed spec §3), against the real test database. Each pass works out the
// whole state, so each test sets a state and runs one.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import type { SiteHealth } from '@agenthix/core'
import { SITE_NOTIFICATION_TYPES as T } from '../../notifications/notificationKinds'
import { reconcileSiteNotifications, __setHqStartedAtForTests } from '../siteNotifications'
import { handleSiteHealthEvent } from '../siteHealth'
import { HELD_FOR_RECONNECT_REASON } from '../../agents/taskExecutionReasons'

const GIB = 1024 ** 3
const longAgo = new Date(Date.now() - 24 * 3600_000)
const healthy: SiteHealth = {
  takenAt: new Date().toISOString(),
  runs: { running: 0, maxAtOnce: 5 },
  disk: { freeBytes: 200 * GIB, totalBytes: 500 * GIB },
  docker: { running: true, version: '27' },
  agentImage: { name: 'agenthix-agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
}

let seq = 0
function makeSite(data: Record<string, unknown> = {}) {
  seq++
  return prisma.executionSite.create({
    data: { siteId: `site-${seq}`, label: `Site ${seq}`, status: 'ONLINE', lastSeenAt: new Date(), credentialHash: 'a'.repeat(64), ...data } as any,
  })
}

const open = (type: string) => prisma.notification.findMany({
  where: { type, status: { in: ['unread', 'read'] } },
  orderBy: { createdAt: 'asc' },
})

let admin: { id: string }
beforeEach(async () => {
  __setHqStartedAtForTests(longAgo)
  await prisma.org.create({ data: { name: 'Test org' } })
  // As the first account an install makes: organisation admin and fleet admin, so it is told of both kinds.
  admin = await createUserWithRole('ADMIN', { fleetAdmin: true })
})

describe('who is told @SC-630', () => {
  it('organisation admins who are still here, and nobody else', async () => {
    await createUserWithRole('MEMBER')
    await createUserWithRole('ADMIN', { deactivatedAt: new Date() })
    await makeSite({ status: 'VERSION_MISMATCH', protocolVersion: '0.2' })
    await reconcileSiteNotifications()
    expect((await open(T.upgrade)).map(n => n.userId)).toEqual([admin.id])
  })

  it('an admin made later is told at the next pass, and one no longer an admin stops being', async () => {
    await makeSite({ status: 'VERSION_MISMATCH', protocolVersion: '0.2' })
    await reconcileSiteNotifications()
    const later = await createUserWithRole('ADMIN')
    await prisma.userSettings.update({ where: { userId: admin.id }, data: { role: 'MEMBER' } })
    await reconcileSiteNotifications()
    expect((await open(T.upgrade)).map(n => n.userId)).toEqual([later.id])
  })
})

describe('a site that needs upgrading @SC-631', () => {
  it('is told at once, with what it stops and who upgrades it (never its versions), and clears when it connects on a matching one', async () => {
    const site = await makeSite({ status: 'VERSION_MISMATCH', protocolVersion: '0.2', label: 'Old server' })
    await createProject({ executionSiteId: site.id })
    await reconcileSiteNotifications()
    expect(await open(T.upgrade)).toMatchObject([{ title: 'Old server needs upgrading', body: 'A fleet admin upgrades it in the Fleet Console. 1 project stops until it is upgraded.' }])

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'ONLINE', protocolVersion: '1.0' } })
    await reconcileSiteNotifications()
    expect(await open(T.upgrade)).toEqual([])
  })

  it('says HQ is the one to upgrade when the site is two majors ahead of it', async () => {
    const site = await makeSite({ status: 'VERSION_MISMATCH', protocolVersion: '3.0', label: 'New server' })
    await createProject({ executionSiteId: site.id })
    await reconcileSiteNotifications()
    expect(await open(T.upgrade)).toMatchObject([{ title: 'New server needs a newer HQ', body: "Whoever runs HQ's machine upgrades HQ. 1 project stops until HQ is upgraded." }])
  })
})

describe('a site not connected while work waits on it @SC-631', () => {
  it('says what waits, and clears when it connects', async () => {
    const site = await makeSite({ status: 'OFFLINE', lastSeenAt: longAgo, label: 'Design laptop' })
    const project = await createProject({ executionSiteId: site.id })
    await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: admin.id, runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON } })
    await prisma.heldSiteInstruction.create({ data: { siteId: site.siteId, method: 'membership.end', params: {} } })
    await reconcileSiteNotifications()
    expect(await open(T.offlineWithWork)).toMatchObject([{ title: 'Design laptop is not connected', body: '1 run and 1 change are waiting for it.' }])

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'ONLINE', lastSeenAt: new Date() } })
    await reconcileSiteNotifications()
    expect(await open(T.offlineWithWork)).toEqual([])
  })

  it('says nothing for a site away with nothing waiting', async () => {
    await makeSite({ status: 'OFFLINE', lastSeenAt: longAgo })
    await reconcileSiteNotifications()
    expect(await open(T.offlineWithWork)).toEqual([])
  })
})

describe("HQ's own site @SC-631", () => {
  it('not running is told once past the grace, and clears when it connects', async () => {
    const site = await makeSite({ isDefault: true, label: 'HQ', status: 'OFFLINE', lastSeenAt: longAgo })
    await reconcileSiteNotifications()
    expect(await open(T.hqSiteDown)).toMatchObject([{ title: "HQ · HQ's site is not running", dismissible: false }])

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'ONLINE', lastSeenAt: new Date() } })
    await reconcileSiteNotifications()
    expect(await open(T.hqSiteDown)).toEqual([])
  })

  it('is not told about while hq has only just started', async () => {
    __setHqStartedAtForTests(new Date())
    await makeSite({ isDefault: true, label: 'HQ', status: 'OFFLINE', lastSeenAt: longAgo })
    await reconcileSiteNotifications()
    expect(await open(T.hqSiteDown)).toEqual([])
  })
})

describe('one notification for one site and one problem @SC-633', () => {
  const every = (type: string) => prisma.notification.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })

  it('stays open, the same one, through a restart of hq while the site is still down', async () => {
    await makeSite({ isDefault: true, label: 'HQ', status: 'OFFLINE', lastSeenAt: longAgo })
    await reconcileSiteNotifications()
    const [first] = await open(T.hqSiteDown)

    // hq restarts: for the grace it cannot tell whether the site is coming back.
    __setHqStartedAtForTests(new Date())
    await reconcileSiteNotifications()
    expect((await open(T.hqSiteDown)).map(n => n.id)).toEqual([first.id])

    // The grace runs out and the site is still down.
    __setHqStartedAtForTests(longAgo)
    await reconcileSiteNotifications()
    expect((await every(T.hqSiteDown)).map(n => [n.id, n.status])).toEqual([[first.id, 'unread']])
  })

  it('stays open while the site drops again moments after it was last heard from', async () => {
    const site = await makeSite({ label: 'Design laptop', status: 'OFFLINE', lastSeenAt: longAgo })
    const project = await createProject({ executionSiteId: site.id })
    await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: admin.id, runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON } })
    await reconcileSiteNotifications()
    const [first] = await open(T.offlineWithWork)

    await prisma.executionSite.update({ where: { id: site.id }, data: { lastSeenAt: new Date() } })
    await reconcileSiteNotifications()
    expect((await every(T.offlineWithWork)).map(n => [n.id, n.status])).toEqual([[first.id, 'unread']])
  })

  it('a problem that returns after it was fixed reopens the same notification, back under Needs you', async () => {
    const site = await makeSite({ isDefault: true, label: 'HQ', status: 'OFFLINE', lastSeenAt: longAgo })
    await reconcileSiteNotifications()
    const [first] = await open(T.hqSiteDown)

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'ONLINE', lastSeenAt: new Date() } })
    await reconcileSiteNotifications()
    expect((await every(T.hqSiteDown)).map(n => n.status)).toEqual(['handled'])

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'OFFLINE', lastSeenAt: longAgo } })
    await reconcileSiteNotifications()
    const after = await every(T.hqSiteDown)
    expect(after.map(n => [n.id, n.status])).toEqual([[first.id, 'unread']])
    expect(after[0].createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime())
  })
})

describe("a site's health @SC-631", () => {
  it('Docker not running is told, and the next good report clears it', async () => {
    const site = await makeSite({ label: 'Build server 2' })
    await handleSiteHealthEvent(site.siteId, { ...healthy, docker: { running: false, version: null } })
    expect(await open(T.health)).toMatchObject([{ title: 'Docker is not running on Build server 2' }])
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).healthReportedAt).toBeInstanceOf(Date)

    await handleSiteHealthEvent(site.siteId, healthy)
    expect(await open(T.health)).toEqual([])
  })

  it('a nearly full disk is told, with what to do and no figure (host-management spec §10)', async () => {
    const site = await makeSite({ label: 'Build server' })
    await handleSiteHealthEvent(site.siteId, { ...healthy, disk: { freeBytes: 2 * GIB, totalBytes: 500 * GIB } })
    const [notice] = await open(T.health)
    expect(notice).toMatchObject({ title: 'Build server is nearly out of disk', body: expect.stringMatching(/^Free space on that machine's disk/) })
    expect(`${notice.title} ${notice.body}`).not.toMatch(/\d/)
  })

  it('a machine nearly out of memory is told, with what to do', async () => {
    const site = await makeSite({ label: 'Build server' })
    await handleSiteHealthEvent(site.siteId, { ...healthy, memoryNearlyFull: true })
    expect(await open(T.health)).toMatchObject([{ title: 'Build server is nearly out of memory', body: expect.stringContaining('agenthix capacity set') }])
    await handleSiteHealthEvent(site.siteId, healthy)
    expect(await open(T.health)).toEqual([])
  })

  it('a malformed report is dropped and the last good one stays', async () => {
    const site = await makeSite()
    await handleSiteHealthEvent(site.siteId, healthy)
    await handleSiteHealthEvent(site.siteId, { docker: 'down' })
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).health).toEqual(healthy)
  })
})

describe('a missed event @SC-633', () => {
  it('cannot leave a notification stuck: a removed site has none at the next pass', async () => {
    const site = await makeSite({ status: 'VERSION_MISMATCH', protocolVersion: '0.2' })
    await reconcileSiteNotifications()
    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedById: admin.id } })
    await reconcileSiteNotifications()
    expect(await open(T.upgrade)).toEqual([])
  })
})
