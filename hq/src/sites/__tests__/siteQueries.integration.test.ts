import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../test/factories'

// The Execution Sites list and a site's page (every screen reviewed spec §3),
// against the real test database. Only the live channel to a site is replaced.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const h = vi.hoisted(() => ({ isOnline: vi.fn(() => false), listAllWorkspaces: vi.fn() }))
vi.mock('../channel', () => ({ siteChannelRegistry: { isOnline: h.isOnline } }))
vi.mock('../../storage/workspaceStore', () => ({ listAllWorkspaces: h.listAllWorkspaces }))

import { getSiteList, getSiteDetail, getFleetAccess } from '../siteQueries'
import { __setHqStartedAtForTests } from '../siteNotifications'
import { HELD_FOR_RECONNECT_REASON } from '../../agents/taskExecutionReasons'

const entities = new Proxy({}, {
  get: (_target, name: string) => (prisma as unknown as Record<string, unknown>)[name[0].toLowerCase() + name.slice(1)],
})
const ctx = (user?: { id: string }) => ({ user, entities }) as any
const longAgo = new Date(Date.now() - 24 * 3600_000)

let seq = 0
function makeSite(data: Record<string, unknown> = {}) {
  seq++
  return prisma.executionSite.create({
    data: { siteId: `site-${seq}`, label: `Site ${seq}`, status: 'ONLINE', lastSeenAt: new Date(), credentialHash: 'a'.repeat(64), credentialPrefix: 'smc_9f2a', ...data } as any,
  })
}

let admin: { id: string }
beforeEach(async () => {
  vi.clearAllMocks()
  __setHqStartedAtForTests(longAgo)
  admin = await createUserWithRole('ADMIN', { displayName: 'Avery' })
})

describe('getSiteList @SC-636', () => {
  it('is for organisation admins only', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(getSiteList(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(getSiteList(undefined as any, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('groups each site by what it needs, with what waits for it and how it was removed', async () => {
    const running = await makeSite({ label: 'Build server', isDefault: true })
    const never = await makeSite({ label: 'Spare mini', status: 'REGISTERED', lastSeenAt: null })
    const away = await makeSite({ label: 'Design laptop', status: 'OFFLINE', lastSeenAt: longAgo })
    const removed = await makeSite({ label: 'Gone', status: 'REVOKED', revokedAt: new Date(), revokedById: admin.id })
    const left = await makeSite({ label: 'Left', status: 'REVOKED', revokedAt: new Date(), leftByItself: true })
    const project = await createProject({ executionSiteId: away.id })
    await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: admin.id, runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON } })

    const list = await getSiteList(undefined as any, ctx(admin))
    const byId = new Map(list.map(s => [s.id, s]))

    expect(byId.get(running.id)).toMatchObject({ group: 'running', connected: true, isDefault: true, removal: null, hqProtocol: '' })
    expect(byId.get(never.id)!.group).toBe('neverConnected')
    expect(byId.get(away.id)).toMatchObject({
      group: 'needsYou', projectCount: 1, waiting: { runs: 1, changes: 0 },
      problems: [{ kind: 'notConnectedWithWork', since: longAgo }],
    })
    expect(byId.get(removed.id)).toMatchObject({ group: 'removed', removal: { by: { userId: admin.id, name: 'Avery' }, leftByItself: false } })
    expect(byId.get(left.id)).toMatchObject({ group: 'removed', removal: { by: null, leftByItself: true } })
  })

  it('keeps a removed site with projects on it under Needs you', async () => {
    const removed = await makeSite({ status: 'REVOKED', revokedAt: new Date(), revokedById: admin.id })
    await createProject({ executionSiteId: removed.id })
    const [entry] = await getSiteList(undefined as any, ctx(admin))
    expect(entry).toMatchObject({ group: 'needsYou', problems: [{ kind: 'removedWithProjects', projects: 1 }] })
  })
})

describe('getSiteDetail @SC-636', () => {
  it('says what is on the site, what runs now, and who approved it', async () => {
    const site = await makeSite({ label: 'Build server', createdById: admin.id })
    const mine = await createProject({ executionSiteId: site.id, name: 'Mobile app', key: 'MOB' })
    await joinProjectAs(mine.id, admin.id)
    await createProject({ executionSiteId: site.id, name: 'Secret', accessLevel: 'PRIVATE' })
    await createTestTask({ data: { title: 'Ship it', projectId: mine.id, number: 4, onBehalfOfUserId: admin.id, runState: 'RUN_ACTIVE' } })
    await prisma.workspacePlacement.create({ data: { workspaceId: 'w1', siteId: site.id } })
    await prisma.userStoragePlacement.create({ data: { userId: admin.id, siteId: site.id } })

    const detail = await getSiteDetail({ executionSiteId: site.id }, ctx(admin))

    expect(detail).toMatchObject({
      label: 'Build server', createdById: admin.id, approvedBy: { name: 'Avery' },
      projects: [{ id: mine.id, name: 'Mobile app', key: 'MOB' }], hiddenProjects: 1,
      peopleWithFiles: 1,
      runningTasks: [{ key: 'MOB-4', title: 'Ship it' }],
    })
    // Not asked of a site that is not connected.
    expect(detail.workspaces).toEqual({ count: 1, named: null })
  })

  it("names the workspaces a connected site holds, in projects the caller may see", async () => {
    h.isOnline.mockReturnValue(true)
    const site = await makeSite()
    const mine = await createProject({ executionSiteId: site.id, name: 'Mobile app' })
    await joinProjectAs(mine.id, admin.id)
    h.listAllWorkspaces.mockResolvedValue([
      { id: 'w1', name: 'release-branch', ownerType: 'project', ownerId: mine.id },
      { id: 'w2', name: 'someone else', ownerType: 'user', ownerId: 'u1' },
    ])
    const detail = await getSiteDetail({ executionSiteId: site.id }, ctx(admin))
    expect(detail.workspaces.named).toEqual([{ id: 'w1', name: 'release-branch', projectName: 'Mobile app' }])
  })

  it('is for organisation admins only, and says when there is no such site', async () => {
    const member = await createUserWithRole('MEMBER')
    const site = await makeSite()
    await expect(getSiteDetail({ executionSiteId: site.id }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getSiteDetail({ executionSiteId: 'nope' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('figures, versions and the credential reach only a fleet admin (spec §10) @SC-939', () => {
  const report = {
    takenAt: new Date().toISOString(), runs: { running: 1, maxAtOnce: 4 }, disk: { freeBytes: 7e9, totalBytes: 500e9 },
    docker: { running: true, version: '27.1' }, agentImage: { name: 'agent', present: true, version: '0.4.0' },
    ceilings: null, memoryNearlyFull: false,
  }

  it('an organisation admin who is not a fleet admin gets the sentence and the load, nothing else, from the list and the page', async () => {
    const site = await makeSite({ label: 'Office', health: report, healthReportedAt: new Date(), protocolVersion: '3.2', status: 'VERSION_MISMATCH' })
    for (const read of [
      async () => (await getSiteList(undefined as any, ctx(admin)))[0],
      async () => getSiteDetail({ executionSiteId: site.id }, ctx(admin)),
    ]) {
      const entry = await read()
      expect(entry).toMatchObject({ figures: false, health: null, protocolVersion: null, load: { running: 1, maxAtOnce: 4 } })
      const text = JSON.stringify(entry)
      for (const leaked of ['27.1', '0.4.0', '3.2', 'freeBytes', 'credentialPrefix', 'smc_9f2a']) expect(text).not.toContain(leaked)
    }
  })

  it('a fleet admin gets the report and the versions', async () => {
    const fleet = await createUserWithRole('ADMIN', { fleetAdmin: true })
    const site = await makeSite({ label: 'Office', health: report, healthReportedAt: new Date(), protocolVersion: '1.5' })
    const [entry] = await getSiteList(undefined as any, ctx(fleet))
    expect(entry).toMatchObject({ figures: true, protocolVersion: '1.5', health: { disk: { freeBytes: 7e9 }, docker: { version: '27.1' } } })
    expect(await getSiteDetail({ executionSiteId: site.id }, ctx(fleet))).toMatchObject({ figures: true, health: { agentImage: { version: '0.4.0' } } })
  })

  it('says who holds the role, for the screens that explain why they show less', async () => {
    const fleet = await createUserWithRole('ADMIN', { fleetAdmin: true })
    await expect(getFleetAccess(undefined as any, ctx(fleet))).resolves.toEqual({ fleetAdmin: true })
    await expect(getFleetAccess(undefined as any, ctx(admin))).resolves.toEqual({ fleetAdmin: false })
    await expect(getFleetAccess(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
