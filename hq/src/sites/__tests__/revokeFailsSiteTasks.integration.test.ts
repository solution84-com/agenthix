import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

// Revoking a site closes its channel at once, so its in-flight runs never
// report again and a revoked site never reconnects to be reconciled. The
// revoke itself has to settle that site's tasks — against the real test DB,
// since site resolution (project site, then agent home site) is the behaviour
// under test. Only the live channel is faked: there is no socket here.

vi.mock('wasp/server', () => ({
  prisma,
  HttpError: class HttpError extends Error {
    statusCode: number
    constructor(statusCode: number, message?: string) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))
const mockRevoke = vi.hoisted(() => vi.fn())
vi.mock('../channel', async () => {
  const { ChannelRequestFailed } = await import('../channel/pendingRequests')
  return { siteChannelRegistry: { revoke: mockRevoke, isOnline: () => false, get: () => null }, ChannelRequestFailed }
})

import { removeSite } from '../../fleet/siteCredentials'
import { HELD_FOR_RECONNECT_REASON, SITE_REVOKED_REASON } from '../../agents/TaskRunner'

let seq = 0
async function makeSite() {
  seq++
  return prisma.executionSite.create({ data: { siteId: `site-${seq}-${Date.now()}`, label: `Site ${seq}` } })
}
async function makeProject(executionSiteId: string) {
  seq++
  return createProject({ name: `Proj ${seq}`, key: `R${seq}X`, executionSiteId })
}
async function makeAgent() {
  seq++
  return prisma.agent.create({ data: { name: 'Test Agent', handle: `agent-${seq}-${Date.now()}` } as any })
}
async function makeTask(projectId: string, assignedAgentId: string, data: Record<string, unknown>) {
  seq++
  return createTestTask({ data: { title: 'A task', projectId, number: seq, assignedAgentId, onBehalfOfUserId: 'person-1', ...data } as any })
}

describe('removing a site in the Fleet Console settles its tasks', () => {
  it('fails the held and RUNNING tasks on the revoked site and leaves another site\'s RUNNING task untouched', async () => {
    const revoked = await makeSite()
    const other = await makeSite()
    const revokedProject = await makeProject(revoked.id)
    const otherProject = await makeProject(other.id)

    const held = await makeTask(revokedProject.id, (await makeAgent()).id, {
      runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON,
    })
    const running = await makeTask(revokedProject.id, (await makeAgent()).id, {
      runState: 'RUN_ACTIVE', runStateReason: 'execution slot available',
    })
    const elsewhere = await makeTask(otherProject.id, (await makeAgent()).id, {
      runState: 'RUN_ACTIVE', runStateReason: 'execution slot available',
    })

    await removeSite({ executionSiteId: revoked.id })

    const read = (id: string) =>
      prisma.task.findUniqueOrThrow({ where: { id }, select: { runState: true, runStateReason: true } })
    expect(await read(held.id)).toEqual({ runState: 'RUN_FAILED', runStateReason: SITE_REVOKED_REASON })
    expect(await read(running.id)).toEqual({ runState: 'RUN_FAILED', runStateReason: SITE_REVOKED_REASON })
    expect(await read(elsewhere.id)).toEqual({ runState: 'RUN_ACTIVE', runStateReason: 'execution slot available' })
    expect(mockRevoke).toHaveBeenCalledWith(revoked.siteId)
  })
})
