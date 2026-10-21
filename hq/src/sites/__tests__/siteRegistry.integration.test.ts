import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject } from '../../test/factories'

// The Execution Sites registry operations against the real test database: the
// list every signed-in person may read, checking a site live, and revoking one.
// Only the live channels are replaced — there is no socket here.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
const h = vi.hoisted(() => ({
  request: vi.fn(),
  revoke: vi.fn(),
  contentRevoke: vi.fn(),
}))
vi.mock('../channel', async () => {
  const { ChannelRequestFailed } = await import('../channel/pendingRequests')
  return { siteChannelRegistry: { request: h.request, revoke: h.revoke }, ChannelRequestFailed }
})
vi.mock('../content', () => ({ contentChannelRegistry: { revoke: h.contentRevoke } }))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../siteNotifications', () => ({ reconcileSiteNotifications: vi.fn(async () => {}) }))

import { getExecutionSites, describeExecutionSite } from '../queries'
import { removeSite } from '../../fleet/siteCredentials'
import { revokeSite } from '../revokeSite'
import { trackRunStatus, __resetActiveRunsForTests } from '../activeRuns'
import { SITE_REVOKED_REASON } from '../../agents/taskExecutionReasons'
import { ChannelRequestFailed } from '../channel/pendingRequests'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

const entities = new Proxy({}, {
  get: (_target, name: string) => (prisma as unknown as Record<string, unknown>)[name[0].toLowerCase() + name.slice(1)],
})
// The operations take Wasp's generated context type; a real prisma delegate per entity is what Wasp passes.
const ctx = (user?: { id: string }) => ({ user, entities }) as any

let seq = 0
function makeSite(data: Record<string, unknown> = {}) {
  seq++
  return prisma.executionSite.create({
    data: { siteId: `site-${seq}`, label: `Site ${seq}`, credentialHash: 'a'.repeat(64), credentialPrefix: 'smc_prefix', ...data },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getExecutionSites @SC-282', () => {
  it('refuses an unauthenticated caller', async () => {
    await expect(getExecutionSites(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('lists every site for any signed-in person, oldest first, with isDefault and no credential columns', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await makeSite({ label: 'Older', isDefault: true, registeredAt: new Date('2026-01-01') })
    await makeSite({ label: 'Newer', registeredAt: new Date('2026-02-01'), status: 'ONLINE' })

    const result = await getExecutionSites(undefined, ctx(viewer))

    expect(result.map((s) => [s.label, s.isDefault])).toEqual([["Older · HQ's site", true], ['Newer', false]])
    expect(result[1]).toMatchObject({ status: 'ONLINE', projectCount: 0 })
    for (const row of result) {
      expect(row).not.toHaveProperty('credentialHash')
      expect(row).not.toHaveProperty('credentialPrefix')
      expect(row).not.toHaveProperty('protocolVersion')
      expect(row).not.toHaveProperty('siteUrl')
    }
  })

  // SC-402: a count that included a private project would tell the caller one exists.
  it('counts only the projects on each site the caller may open', async () => {
    const caller = await createUser()
    const someoneElse = await createUser()
    const site = await makeSite()
    const joined = await createProject({ executionSiteId: site.id, accessLevel: 'OPEN' })
    await createProject({ executionSiteId: site.id, accessLevel: 'OPEN' })
    const listed = await createProject({ executionSiteId: site.id, accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [joined, listed].map(p => ({ projectId: p.id, userId: caller.id })) })
    await createProject({ executionSiteId: site.id, accessLevel: 'PRIVATE' })
    await createProject({ executionSiteId: site.id, accessLevel: 'PRIVATE', personalOwnerId: caller.id })
    await createProject({ executionSiteId: site.id, accessLevel: 'PRIVATE', personalOwnerId: someoneElse.id })

    const [row] = await getExecutionSites(undefined, ctx(caller))

    expect(row.projectCount).toBe(3)
  })
})

describe('describeExecutionSite @SC-295 @SC-296', () => {
  it('returns what the site reported, asked over its channel', async () => {
    const admin = await createUserWithRole('ADMIN', { fleetAdmin: true })
    h.request.mockResolvedValue({ siteId: 's1', name: 'Box', protocolVersion: '6.0', startedAt: 'now' })
    await expect(describeExecutionSite({ siteId: 's1' }, ctx(admin))).resolves.toMatchObject({ name: 'Box' })
    expect(h.request).toHaveBeenCalledWith('s1', 'site.describe', {})
  })

  it('refuses a caller who is not signed in, not a fleet admin, or has no role, and asks nothing', async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const operator = await createUserWithRole('MEMBER')
    const noRole = await createUser()
    await expect(describeExecutionSite({ siteId: 's1' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(describeExecutionSite({ siteId: 's1' }, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await expect(describeExecutionSite({ siteId: 's1' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    await expect(describeExecutionSite({ siteId: 's1' }, ctx(noRole))).rejects.toMatchObject({ statusCode: 403 })
    expect(h.request).not.toHaveBeenCalled()
  })

  it('turns an offline site into a 409 with the reason, not a 500', async () => {
    const admin = await createUserWithRole('ADMIN', { fleetAdmin: true })
    h.request.mockRejectedValue(new ChannelRequestFailed('Execution Site s1 is not connected', 'offline'))
    await expect(describeExecutionSite({ siteId: 's1' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 409, message: 'Execution Site s1 is not connected' })
  })
})

describe('removing a site in the Fleet Console @SC-286', () => {
  async function holdInstruction(siteId: string) {
    return prisma.heldSiteInstruction.create({ data: { siteId, method: 'membership.end', params: {} } })
  }

  it('marks the row REVOKED before it closes the live channels, then fails the site\'s tasks', async () => {
    const site = await makeSite({ status: 'ONLINE' })
    let statusWhenChannelClosed: Promise<string | undefined> | undefined
    h.revoke.mockImplementation((siteId: string) => {
      statusWhenChannelClosed = prisma.executionSite.findUnique({ where: { siteId } }).then((r) => r?.status)
    })

    expect(await removeSite({ executionSiteId: site.id })).toEqual({ removed: true })

    // Recorded as removed, and when; by the Fleet Console, so by no account of hq's.
    expect(await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } }))
      .toMatchObject({ status: 'REVOKED', revokedById: null, revokedAt: expect.any(Date), leftByItself: false })
    // A reconnect is refused once the row reads REVOKED, so the row must be written first.
    expect(await statusWhenChannelClosed).toBe('REVOKED')
    expect(h.revoke).toHaveBeenCalledWith(site.siteId)
    expect(h.contentRevoke).toHaveBeenCalledWith(site.siteId)
    expect(taskRunnerFake.taskRunner.failTasksForRevokedSite).toHaveBeenCalledWith(site.siteId)
    expect(h.revoke.mock.invocationCallOrder[0])
      .toBeLessThan(taskRunnerFake.taskRunner.failTasksForRevokedSite.mock.invocationCallOrder[0])
  })

  it('removes a site once, and keeps when it was removed @SC-636', async () => {
    const site = await makeSite({ status: 'ONLINE' })
    await removeSite({ executionSiteId: site.id })
    const first = (await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).revokedAt

    expect(await removeSite({ executionSiteId: site.id })).toEqual({ removed: false })
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).revokedAt).toEqual(first)
  })

  it('drops the instructions held for the removed site, and only those', async () => {
    const site = await makeSite()
    const other = await makeSite()
    await holdInstruction(site.siteId)
    const kept = await holdInstruction(other.siteId)

    await removeSite({ executionSiteId: site.id })

    expect(await prisma.heldSiteInstruction.findMany({ select: { id: true } })).toEqual([{ id: kept.id }])
  })

  it('refuses the default site, and revokes nothing @SC-636', async () => {
    const site = await makeSite({ isDefault: true, status: 'ONLINE' })

    await expect(removeSite({ executionSiteId: site.id })).rejects.toMatchObject({ code: 'not_allowed' })

    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('ONLINE')
    expect(h.revoke).not.toHaveBeenCalled()
    expect(h.contentRevoke).not.toHaveBeenCalled()
    expect(taskRunnerFake.taskRunner.failTasksForRevokedSite).not.toHaveBeenCalled()
  })

  it('fails for a site that does not exist, and closes nothing', async () => {
    await expect(removeSite({ executionSiteId: 'no-such-site' })).rejects.toMatchObject({ code: 'not_found' })
    expect(h.revoke).not.toHaveBeenCalled()
  })
})

describe('revokeSite ends the runs it strands — R-058', () => {
  const emit = vi.fn()
  const to = vi.fn(() => ({ emit }))
  beforeEach(() => {
    __resetActiveRunsForTests()
    ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = { to }
  })
  afterEach(() => {
    delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__
  })

  it("tells each affected session's room its run failed, after the tasks have been failed", async () => {
    const site = await makeSite()
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, site.siteId)
    trackRunStatus({ runId: 'run-2', sessionId: 'sess-2', status: 'RUNNING' }, 'another-site')

    await revokeSite(site.siteId, { byId: 'admin-1' })

    expect(to).toHaveBeenCalledExactlyOnceWith('session:sess-1')
    expect(emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'FAILED', error: SITE_REVOKED_REASON })
    // A task page refetches on this event, so the task must already read FAILED.
    expect(taskRunnerFake.taskRunner.failTasksForRevokedSite.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0])
  })

  it('still announces the runs when failing the tasks throws', async () => {
    const site = await makeSite()
    trackRunStatus({ runId: 'run-1', sessionId: 'sess-1', status: 'RUNNING' }, site.siteId)
    taskRunnerFake.taskRunner.failTasksForRevokedSite.mockRejectedValueOnce(new Error('db blip'))

    await expect(revokeSite(site.siteId, { byId: 'admin-1' })).rejects.toThrow('db blip')

    expect(emit).toHaveBeenCalledWith('agentRunStatus', expect.objectContaining({ runId: 'run-1', status: 'FAILED' }))
    expect((await prisma.executionSite.findUniqueOrThrow({ where: { id: site.id } })).status).toBe('REVOKED')
  })
})
