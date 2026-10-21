/**
 * Integration tests for the agent-run lifecycle + read paths (ADR-0035 — real
 * test DB).
 *
 * Scope (F-017c): agents/runs scenarios that touch the database —
 *   SC-056 cancel a run, SC-058 run history, SC-059 tool-call log,
 *   Stopping an agent or everything is
 *   agentStop.integration.test.ts.
 *
 * The runs live on the site, held by the siteRuntimeStore fake; the session
 * lifecycle runs against the real test database. wasp/server is re-exported
 * with the test Prisma client so service-layer code that imports it does real
 * DB work.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from 'wasp/server'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createProject, createSession, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

// plan 5d-2 task 9a: cancel/stop now reach the run through the site channel,
// not the in-process engine — faked here rather than DB-backed, since there
// is no real site connection in a test process. AgentRun itself lives on
// site now (task 10 "shed" — hq's own copy dropped from schema.prisma), so
// nothing here seeds or asserts against a real AgentRun row anymore; a run
// is just an opaque id the store mocks are told to report.
// cancelAgentRun (finding 2 fix) now verifies runId->sessionId ownership via
// getRun before cancelling — defaults to a run row that matches whatever
// sessionId/runId a test passes in; the foreign-run test below overrides it.
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

// getRecentActivity (queries.ts) and getToolCallLog/
// getRunManifestStatus (manifestQueries.ts) resolve "no session/task anchor"
// reads to hq's own local site, and a session's own site is resolved from
// the storage it works in. Both run for real here, against the registered
// site the factories stand up — faking the resolver instead handed the
// placement writer a site id no row matched, which the database refused.

vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import { cancelAgentRun } from '../../sessions/actions'
import { getTaskRuns } from '../../sessions/queries'
import { getToolCallLog } from '../manifestQueries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

function ctx(user: { id: string } | undefined) {
  return {
    user,
    entities: {
      Agent: prisma.agent,
      AgentSession: prisma.agentSession,
    },
  } as any
}

describe('cancelAgentRun @SC-056', () => {
  beforeEach(() => vi.clearAllMocks())

  it("cancels a running run owned by the caller", async () => {
    const user = await createUserWithRole('MEMBER')
    const agent = await createAgent()
    const session = await createSession({ userId: user.id, agentId: agent.id })
    const runId = 'run-owned'
    siteStore.getRun.mockResolvedValue({ id: runId, sessionId: session.id })

    await cancelAgentRun({ runId, sessionId: session.id }, ctx(user))

    // The run records who stopped it (every-screen-reviewed spec §9).
    expect(siteStore.cancelRun).toHaveBeenCalledWith(expect.any(String), runId, undefined, user.id.slice(0, 8))
  })

  it("rejects cancelling a run in a session the caller does not own (404)", async () => {
    const owner = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    const session = await createSession({ userId: owner.id })
    const runId = 'run-not-mine'
    siteStore.getRun.mockResolvedValue({ id: runId, sessionId: session.id })

    await expect(cancelAgentRun({ runId, sessionId: session.id }, ctx(other))).rejects.toMatchObject({ statusCode: 404 })
    expect(siteStore.cancelRun).not.toHaveBeenCalled()
  })

  // Finding 2 (quality review): the session-ownership check above only
  // proves the caller owns `sessionId` — this proves the run itself is also
  // checked, refusing a foreign runId paired with the caller's own session.
  it("rejects cancelling a runId that belongs to a different session (404), even though the caller owns the sessionId supplied", async () => {
    const user = await createUserWithRole('MEMBER')
    const agent = await createAgent()
    const session = await createSession({ userId: user.id, agentId: agent.id })
    const otherSession = await createSession({ userId: user.id, agentId: agent.id })
    const foreignRunId = 'run-foreign'
    siteStore.getRun.mockResolvedValue({ id: foreignRunId, sessionId: otherSession.id })

    await expect(
      cancelAgentRun({ runId: foreignRunId, sessionId: session.id }, ctx(user)),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(siteStore.cancelRun).not.toHaveBeenCalled()
  })
})

// Pre-review fix: a task-scoped session (taskId set) is gated by its task's
// project membership against the real rule, not by the arbitrary routing-
// admin userId the row carries — same fix as updateSession/archiveSession/
// triggerAgentRun in sessions/__tests__/sessionActions.integration.test.ts.
describe('cancelAgentRun — a task-scoped session is reachable by its project', () => {
  beforeEach(() => vi.clearAllMocks())

  it("a member of the task's project may cancel a run on its session", async () => {
    const routingAdmin = await createUser()
    const member = await createUserWithRole('MEMBER')
    const project = await createProject({ name: 'Private', key: `PR${Date.now()}`, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    const task = await createTestTask({ data: { title: 'T2', projectId: project.id, number: 1, onBehalfOfUserId: 'person-1' } as any })
    const session = await createSession({ userId: routingAdmin.id, sessionType: 'task', taskId: task.id })
    const runId = 'run-task-scoped'
    siteStore.getRun.mockResolvedValue({ id: runId, sessionId: session.id })

    await cancelAgentRun({ runId, sessionId: session.id }, ctx(member))

    expect(siteStore.cancelRun).toHaveBeenCalledWith(expect.any(String), runId, undefined, expect.any(String))
  })

  it("refuses an outsider — the run is never looked up, let alone cancelled", async () => {
    const routingAdmin = await createUser()
    const outsider = await createUserWithRole('MEMBER')
    const project = await createProject({ name: 'Private2', key: `PR2${Date.now()}`, accessLevel: 'PRIVATE' })
    const task = await createTestTask({ data: { title: 'T3', projectId: project.id, number: 1, onBehalfOfUserId: 'person-1' } as any })
    const session = await createSession({ userId: routingAdmin.id, sessionType: 'task', taskId: task.id })
    const runId = 'run-task-scoped-2'
    siteStore.getRun.mockResolvedValue({ id: runId, sessionId: session.id })

    await expect(cancelAgentRun({ runId, sessionId: session.id }, ctx(outsider)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.getRun).not.toHaveBeenCalled()
    expect(siteStore.cancelRun).not.toHaveBeenCalled()
  })
})

// A person's own conversation outside any project is theirs to stop, whatever
// their organisation role: no organisation role withholds work (adr-0102).
describe('cancelAgentRun in their own conversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['MEMBER', null] as const)('lets a caller whose organisation role is %s stop their own run', async (role) => {
    const user = role ? await createUserWithRole(role) : await createUser()
    const agent = await createAgent()
    const session = await createSession({ userId: user.id, agentId: agent.id })
    siteStore.getRun.mockResolvedValue({ id: 'run-own', sessionId: session.id })

    await cancelAgentRun({ runId: 'run-own', sessionId: session.id }, ctx(user))
    expect(siteStore.cancelRun).toHaveBeenCalled()
  })
})

describe('getTaskRuns @SC-058', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns per-task run history scoped to a task', async () => {
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })
    const project = await createProject({ name: 'P', key: `P${Date.now()}` })
    const viewer = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id } })
    const task = await createTestTask({ data: { title: 'T1', projectId: project.id, number: 1, onBehalfOfUserId: 'person-1' } as any })
    siteStore.listRuns.mockResolvedValueOnce([
      { id: 'run-with-task', agentId: agent.id, sessionId: session.id, taskId: task.id, status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z' },
    ])

    const taskRuns = await getTaskRuns({ taskId: task.id }, ctx(viewer))
    expect(siteStore.listRuns).toHaveBeenCalledWith(expect.any(String), { taskId: task.id, limit: 20 })
    expect(taskRuns.length).toBe(1)
    expect(taskRuns[0].taskId).toBe(task.id)
  })
})

describe('getTaskRuns — sign-in', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a caller who is not signed in with 401, without reading runs', async () => {
    await expect(getTaskRuns({ taskId: 'any-task' }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(siteStore.listRuns).not.toHaveBeenCalled()
  })
})

describe('getToolCallLog @SC-059', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a run tool-call log ordered oldest-first with tool, risk, blocked + reason', async () => {
    const agent = await createAgent()
    const user = await createUser()
    // ADR-0041: getToolCallLog is owner-only for chat-session-backed runs, so the
    // session must belong to the same user the query is called as.
    const session = await createSession({ agentId: agent.id, userId: user.id })
    siteStore.getRun.mockResolvedValue({ id: 'run-1', sessionId: session.id })
    siteStore.listToolCalls.mockResolvedValueOnce([
      { toolName: 'read_file', toolInput: { path: 'a.txt' }, riskLevel: 'SAFE', blocked: false, blockReason: null },
      { toolName: 'bash', toolInput: { cmd: 'rm -rf /' }, riskLevel: 'HIGH', blocked: true, blockReason: 'denied by policy' },
    ])

    const log = await getToolCallLog({ runId: 'run-1', sessionId: session.id }, ctx(user))
    expect(log.length).toBe(2)
    expect(log[0].toolName).toBe('read_file')
    expect(log[1].toolName).toBe('bash')
    expect(log[1].riskLevel).toBe('HIGH')
    expect(log[1].blocked).toBe(true)
    expect(log[1].blockReason).toBe('denied by policy')
  })

  it('rejects an unauthenticated caller', async () => {
    await expect(getToolCallLog({ runId: 'r1', sessionId: 's1' }, ctx(undefined))).rejects.toBeInstanceOf(HttpError)
  })
})
