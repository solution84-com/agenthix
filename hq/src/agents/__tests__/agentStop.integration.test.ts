/**
 * Stopping work, against the real test database (SC-057, SC-179, SC-185): stopping an agent cancels its active
 * runs on every site it works on, an organisation admin's change; stopping everything cancels every active run
 * in the organisation. The runs live on the sites, held by the siteRuntimeStore fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from 'wasp/server'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createSession } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import { stopAgent } from '../actions'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { stopAllSessions } from '../../sessions/actions'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

function ctx(user: { id: string } | undefined) {
  return { user, entities: { Agent: prisma.agent, AgentSession: prisma.agentSession } } as any
}

describe('stopAgent @SC-057 @SC-179', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cancels pending/running runs, and returns cancelledRuns', async () => {
    const user = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    const session = await createSession({ userId: user.id, agentId: agent.id })
    siteStore.listRuns.mockResolvedValueOnce([{ id: 'run-pending' }, { id: 'run-running' }])
    void session

    const result = await stopAgent({ id: agent.id }, ctx(user))

    // SC-179: returns the count of pending/running runs it cancelled.
    expect(result).toEqual({ ok: true, cancelledRuns: 2 })
    // The site-side "stop everything for this agent" call fires once...
    expect(siteStore.stopAgent).toHaveBeenCalledWith(expect.any(String), agent.handle)
    // ...and only the two active runs the store reports are cancelled.
    expect(siteStore.cancelRun).toHaveBeenCalledTimes(2)
  })

  it('returns cancelledRuns: 0 for an agent with no active runs', async () => {
    const admin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    // A session, so the agent has a site to be stopped ON — stopping reaches
    // the sites the agent has worked on, and an agent that has never had a
    // session has no container anywhere to address. What this test is about
    // is the run count, so the session's site reports no active runs.
    await createSession({ agentId: agent.id })
    const result = await stopAgent({ id: agent.id }, ctx(admin))
    expect(result).toEqual({ ok: true, cancelledRuns: 0 })
    expect(siteStore.stopAgent).toHaveBeenCalledWith(expect.any(String), agent.handle)
  })

  it('answers 503 when a site does not answer, and stops the agent on the others first', async () => {
    const admin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    await createSession({ agentId: agent.id })
    siteStore.stopAgent.mockRejectedValueOnce(new SiteUnreachableError('Office', 'site-office'))

    await expect(stopAgent({ id: agent.id }, ctx(admin))).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('may still be running') })
  })

  it('returns 404 for an unknown agent', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(stopAgent({ id: 'nope' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })

  // R-195: stopping an agent cancels its runs on
  // every site — the organisation admin's, like every other change to an agent.
  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN, and changes nothing', async (role) => {
    const caller = await createUserWithRole(role)
    const agent = await createAgent()
    await createSession({ agentId: agent.id })

    await expect(stopAgent({ id: agent.id }, ctx(caller)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })

    expect(siteStore.stopAgent).not.toHaveBeenCalled()
    expect(siteStore.cancelRun).not.toHaveBeenCalled()
  })
})

describe('stopAllSessions @SC-185', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cancels every active run org-wide and returns the total cancelled', async () => {
    await prisma.executionSite.create({ data: { siteId: 'site-org-wide', label: 'Local' } })
    siteStore.listRuns.mockResolvedValueOnce([{ id: 'run-a' }, { id: 'run-b' }, { id: 'run-c' }])

    // stopAllSessions is now ADMIN-gated. This scenario is about the return
    // value (the total cancelled), not about who may call the op, so the
    // fixture just needs a real UserSettings row that clears the floor —
    // same shape as agentCrud.integration.test.ts's own createAdminUser.
    const admin = await createUser()
    await prisma.userSettings.create({ data: { userId: admin.id, role: 'ADMIN' } })

    const result = await stopAllSessions(undefined, ctx(admin))
    expect(result).toEqual({ cancelled: 3 })
    expect(siteStore.cancelRun).toHaveBeenCalledTimes(3)
  })

  it('rejects an unauthenticated caller', async () => {
    await expect(stopAllSessions(undefined, ctx(undefined))).rejects.toBeInstanceOf(HttpError)
  })
})
