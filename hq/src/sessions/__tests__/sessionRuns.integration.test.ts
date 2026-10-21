import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createSession, createWorkerSession, createProject, joinProjectAs } from '../../test/factories'
import { ctx, setRole } from './sessionActionsHarness'

// Sending a message, stopping a session and stopping every run, against the
// real test DB (ADR-0035). Covers SC-075, SC-076, SC-191. Who may do each is in
// sessionRunAccess and sessionControl .integration.test.ts; a run lives on its
// site, which is the shared fake here.
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { triggerAgentRun, stopTaskSession, stopAllSessions } from '../actions'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

async function ownChat(role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const owner = await createUserWithRole(role)
  const agent = await createAgent()
  const session = await createWorkerSession({ userId: owner.id, agentId: agent.id })
  return { owner, agent, session }
}

describe('triggerAgentRun @SC-191', () => {
  it('lets the owner send a message, dispatched for that session', async () => {
    const { owner, session } = await ownChat()
    const result = await triggerAgentRun({ sessionId: session.id, inputText: 'hello there' }, ctx(owner))
    expect(result).toEqual({ id: expect.any(String), status: 'PENDING' })
    expect(dispatchFake.dispatchedChatRuns).toEqual([expect.objectContaining({ sessionId: session.id, inputText: 'hello there' })])
  })

  it("refuses the owner of a chat in a project they are now the Viewer of with 403, and dispatches nothing (adr-0102)", async () => {
    const owner = await createUserWithRole('ADMIN')
    const project = await createProject()
    await joinProjectAs(project.id, owner.id, 'VIEWER')
    const session = await createWorkerSession({ userId: owner.id, agentId: (await createAgent()).id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })

  it('lets the owner of a chat outside any project send, whatever their organisation role, no settings row included', async () => {
    const owner = await createUser()
    const session = await createWorkerSession({ userId: owner.id, agentId: (await createAgent()).id })
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).resolves.toMatchObject({ status: 'PENDING' })
  })

  // dispatchChatRun's buildContext resolves and delivers this run's package
  // versions — a failure there is person-actionable, not a server fault, so it
  // surfaces as 409 (not a bare 500).
  it('a package error from dispatch surfaces as 409, naming the reason', async () => {
    const { owner, session } = await ownChat()
    const { PackageDeliveryError } = await import('../../packages/packageDelivery')
    dispatchFake.dispatchChatRun.mockRejectedValueOnce(
      new PackageDeliveryError('package_delivery_failed', 'Delivering the agent package a1 to Execution Site s1 failed: disk full'),
    )
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('disk full') })
  })

  it('an agent with no content surfaces as 409, not 500', async () => {
    const { owner, agent, session } = await ownChat()
    const { AgentPackageMissingError } = await import('../../packages/runPackages')
    dispatchFake.dispatchChatRun.mockRejectedValueOnce(new AgentPackageMissingError(agent.id))
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a caller who is not signed in', async () => {
    const { session } = await ownChat()
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })
})

describe('stopTaskSession @SC-075', () => {
  it('cancels every active run on the session, leaves finished ones, and reports the count', async () => {
    const { owner, session } = await ownChat()
    siteStore.addRun('site-1', { id: 'run-running', sessionId: session.id, status: 'RUNNING' })
    siteStore.addRun('site-1', { id: 'run-pending', sessionId: session.id, status: 'PENDING' })
    siteStore.addRun('site-1', { id: 'run-done', sessionId: session.id, status: 'COMPLETED' })
    siteStore.addRun('site-1', { id: 'run-elsewhere', sessionId: 'another-session', status: 'RUNNING' })

    const result = await stopTaskSession({ sessionId: session.id }, ctx(owner))

    expect(result.cancelled).toBe(2)
    expect(siteStore.cancelledRuns.map((r) => r.runId).sort()).toEqual(['run-pending', 'run-running'])
    expect((await siteStore.getRun('site-1', 'run-elsewhere'))?.status).toBe('RUNNING')
    expect((await siteStore.getRun('site-1', 'run-done'))?.status).toBe('COMPLETED')
  })

  it('rejects a caller who is not signed in', async () => {
    const { session } = await ownChat()
    siteStore.addRun('site-1', { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
    await expect(stopTaskSession({ sessionId: session.id }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it('is a no-op (cancelled: 0) when the session has no active runs, and for a session that does not exist', async () => {
    const { owner, session } = await ownChat()
    await expect(stopTaskSession({ sessionId: session.id }, ctx(owner))).resolves.toEqual({ cancelled: 0 })
    await expect(stopTaskSession({ sessionId: 'no-such-session' }, ctx(owner))).resolves.toEqual({ cancelled: 0 })
  })

  // A person's own conversation is theirs to stop, whatever their organisation role (adr-0102).
  it('lets the owner stop their own session, whatever their organisation role', async () => {
    const owner = await createUser()
    const session = await createWorkerSession({ userId: owner.id, agentId: (await createAgent()).id })
    siteStore.addRun('site-1', { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
    await expect(stopTaskSession({ sessionId: session.id }, ctx(owner))).resolves.toEqual({ cancelled: 1 })
  })
})

// Stopping every run is org-wide, so it is gated to the org admin rather than
// scoped to the caller (Phase 8's decision).
describe('stopAllSessions @SC-076', () => {
  async function sites() {
    await prisma.executionSite.create({ data: { siteId: 'site-1', label: 'Local' } })
    await prisma.executionSite.create({ data: { siteId: 'site-2', label: 'Other' } })
    await prisma.executionSite.create({ data: { siteId: 'site-revoked', label: 'Revoked', status: 'REVOKED' } })
    siteStore.addRun('site-1', { id: 'run-a', status: 'RUNNING' })
    siteStore.addRun('site-1', { id: 'run-b', status: 'PENDING' })
    siteStore.addRun('site-2', { id: 'run-c', status: 'RUNNING' })
    siteStore.addRun('site-revoked', { id: 'run-r', status: 'RUNNING' })
  }

  it('lets an org admin cancel the active runs on every registered, non-revoked Execution Site', async () => {
    await sites()
    const admin = await createUserWithRole('ADMIN')

    await expect(stopAllSessions(undefined, ctx(admin))).resolves.toEqual({ cancelled: 3 })

    const by = admin.id.slice(0, 8)
    expect(siteStore.cancelledRuns).toEqual(expect.arrayContaining([
      { siteId: 'site-1', runId: 'run-a', by }, { siteId: 'site-1', runId: 'run-b', by }, { siteId: 'site-2', runId: 'run-c', by },
    ]))
    // The revoked site is never swept.
    expect((await siteStore.getRun('site-revoked', 'run-r'))?.status).toBe('RUNNING')
  })

  it.each(['MEMBER', null] as const)('refuses a caller whose role is %s (403) and cancels nothing', async (role) => {
    await sites()
    const caller = await createUser()
    await setRole(caller.id, role)
    await expect(stopAllSessions(undefined, ctx(caller))).rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it('rejects a caller who is not signed in', async () => {
    await sites()
    await expect(stopAllSessions(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(siteStore.cancelledRuns).toEqual([])
  })
})
