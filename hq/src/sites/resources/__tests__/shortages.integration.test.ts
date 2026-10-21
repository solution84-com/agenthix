/**
 * Runs and members told when a site runs short (host-management spec §10), against the real test database: the
 * members whose projects run on a machine nearly out of disk or memory are warned once for each condition, in a
 * sentence with no figure; and the people who look after machines are told when a run stops for lack of resources,
 * once a day for each site and cause.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent, SiteHealth } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createProject, createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
const owner = vi.hoisted(() => ({ siteId: '' }))
vi.mock('../../channel/sessionOwnerSite', () => ({ sessionOwnedBy: async (_session: string, siteId: string) => siteId === owner.siteId }))

import { RUN_SHORT_NOTIFICATION, SITE_NEARLY_OUT_NOTIFICATION } from '../../../notifications/notificationKinds'
import { reconcileSiteNotifications, __setHqStartedAtForTests } from '../../siteNotifications'
import { handleSiteHealthEvent } from '../../siteHealth'
import { tellOfShortRun } from '../runResourceNotice'

const GIB = 1024 ** 3
const healthy: SiteHealth = {
  takenAt: new Date().toISOString(),
  runs: { running: 0, maxAtOnce: 4 },
  disk: { freeBytes: 200 * GIB, totalBytes: 500 * GIB },
  docker: { running: true, version: '27' },
  agentImage: { name: 'agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
}
const nearlyFull = { ...healthy, disk: { freeBytes: 2 * GIB, totalBytes: 500 * GIB } }

let seq = 0
const makeSite = () => prisma.executionSite.create({
  data: { siteId: `short-${++seq}-${Date.now()}`, label: 'office-server', status: 'ONLINE', lastSeenAt: new Date(), credentialHash: 'a'.repeat(64) },
})

const open = (type: string) => prisma.notification.findMany({ where: { type, status: { in: ['unread', 'read'] } }, orderBy: { createdAt: 'asc' } })

let admin: { id: string }
beforeEach(async () => {
  __setHqStartedAtForTests(new Date(Date.now() - 24 * 3600_000))
  await prisma.org.create({ data: { name: 'Test org' } })
  admin = await createUserWithRole('ADMIN', { fleetAdmin: true })
})

async function memberOnSite(siteRowId: string) {
  const member = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Robot arm firmware', executionSiteId: siteRowId })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
  return member
}

describe('members whose projects run on a machine nearly out of disk or memory', () => {
  it('are warned once for each condition, however many reports say so, in a sentence with no figure', async () => {
    const site = await makeSite()
    const member = await memberOnSite(site.id)
    const elsewhere = await createUserWithRole('MEMBER')

    await handleSiteHealthEvent(site.siteId, nearlyFull)
    await handleSiteHealthEvent(site.siteId, { ...nearlyFull, takenAt: new Date().toISOString() })
    await handleSiteHealthEvent(site.siteId, { ...nearlyFull, disk: { freeBytes: 1 * GIB, totalBytes: 500 * GIB } })

    const warned = await open(SITE_NEARLY_OUT_NOTIFICATION)
    expect(warned.map(n => n.userId)).toEqual([member.id])
    expect(warned[0]).toMatchObject({
      title: 'office-server is nearly out of disk',
      body: 'office-server is nearly out of disk; runs may fail. Your fleet admins have been told.',
    })
    expect(`${warned[0].title} ${warned[0].body}`).not.toMatch(/\d/)
    expect(await prisma.notification.count({ where: { type: SITE_NEARLY_OUT_NOTIFICATION } })).toBe(1)
    expect(warned.some(n => n.userId === elsewhere.id)).toBe(false)
  })

  it('are no longer warned once it has room again, and are warned again if it runs short again', async () => {
    const site = await makeSite()
    await memberOnSite(site.id)
    await handleSiteHealthEvent(site.siteId, { ...healthy, memoryNearlyFull: true })
    expect(await open(SITE_NEARLY_OUT_NOTIFICATION)).toMatchObject([{ title: 'office-server is nearly out of memory' }])

    await handleSiteHealthEvent(site.siteId, healthy)
    expect(await open(SITE_NEARLY_OUT_NOTIFICATION)).toEqual([])

    await handleSiteHealthEvent(site.siteId, { ...healthy, memoryNearlyFull: true })
    expect(await open(SITE_NEARLY_OUT_NOTIFICATION)).toHaveLength(1)
  })

  it('who dismissed the warning are not told again while the condition lasts', async () => {
    const site = await makeSite()
    await memberOnSite(site.id)
    await handleSiteHealthEvent(site.siteId, nearlyFull)
    await prisma.notification.updateMany({ where: { type: SITE_NEARLY_OUT_NOTIFICATION }, data: { status: 'dismissed' } })
    await handleSiteHealthEvent(site.siteId, nearlyFull)
    await reconcileSiteNotifications()
    expect(await open(SITE_NEARLY_OUT_NOTIFICATION)).toEqual([])
  })
})

describe('a run that stopped for lack of resources', () => {
  const failed = (over: Partial<RunStatusEvent> = {}): RunStatusEvent => ({
    runId: 'r1', sessionId: 's1', taskId: null, agentId: 'a', agentHandle: 'a', status: 'FAILED', error: 'exited with code 137',
    resource: { cause: 'memory', limit: 4 * GIB }, sessionPatch: null, manifestPending: null, ...over,
  })

  it('tells the people who look after machines, with what to do, once a day for each site and cause', async () => {
    const site = await makeSite()
    owner.siteId = site.siteId
    const member = await memberOnSite(site.id)
    const day = new Date('2026-10-14T09:00:00Z')

    await tellOfShortRun(failed(), site.siteId, day)
    await tellOfShortRun(failed({ runId: 'r2' }), site.siteId, new Date('2026-10-14T15:00:00Z'))
    const told = await open(RUN_SHORT_NOTIFICATION)
    expect(told.map(n => n.userId)).toEqual([admin.id])
    expect(told[0]).toMatchObject({ title: 'A run on office-server ran out of memory', body: expect.stringContaining('Each run there gets 4 GB') })
    expect(told.some(n => n.userId === member.id)).toBe(false)

    // The next day's is new, and the day before's is put away.
    await tellOfShortRun(failed({ runId: 'r3' }), site.siteId, new Date('2026-10-15T09:00:00Z'))
    expect((await open(RUN_SHORT_NOTIFICATION)).map(n => n.subjectKey)).toEqual([`${site.siteId}:memory:2026-10-15`])
  })

  it('tells fleet admins only: an organisation admin without the role is not told, a member who holds it is', async () => {
    const site = await makeSite()
    owner.siteId = site.siteId
    const orgAdminOnly = await createUserWithRole('ADMIN')
    const fleetMember = await createUserWithRole('MEMBER', { fleetAdmin: true })
    await tellOfShortRun(failed(), site.siteId)
    const told = (await open(RUN_SHORT_NOTIFICATION)).map(n => n.userId)
    expect(told.sort()).toEqual([admin.id, fleetMember.id].sort())
    expect(told).not.toContain(orgAdminOnly.id)
  })

  it('tells nobody for a run that failed for anything else, or a frame from a site that does not own the run', async () => {
    const site = await makeSite()
    owner.siteId = site.siteId
    await tellOfShortRun(failed({ resource: undefined }), site.siteId)
    await tellOfShortRun(failed({ resource: { cause: 'OOMKilled' } as never }), site.siteId)
    await tellOfShortRun(failed(), 'some-other-site')
    expect(await open(RUN_SHORT_NOTIFICATION)).toEqual([])
  })
})
