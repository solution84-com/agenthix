/**
 * Integration tests for HITL manifest approve/reject (ADR-0035 — real test DB).
 *
 * Scope (F-017c): agents/runs scenarios —
 *   SC-183 approving a non-PENDING_APPROVAL run is rejected (400),
 *   SC-184 rejecting a task run posts a __MANIFEST_REJECTED__ comment and holds
 *          the task for human review (BLOCKED, no re-dispatch);
 *          rejecting a chat run is refused for a non-owner and cancels for the owner.
 *
 * The run row itself lives on site — hq's schema declares no local `AgentRun`
 * table at all — this file fakes `siteRuntimeStore`
 * in-memory (getRun/approveRun/rejectRun over a plain Map) rather than mocking
 * per-call, so approve/reject's own read-then-write sequence runs exactly as
 * it would against a real site. Everything hq still owns locally — User,
 * UserSettings, Agent, Project, Task, TaskComment, AgentSession — runs
 * against the real test DB, including the site resolution itself
 * (`dispatchService.resolveSiteIdForTask`/`resolveSiteIdForSession`, real and
 * unmocked). Both resolve from the storage the run is for and refuse a
 * location that names no site, so the fixtures register one — a task run
 * through its project, a chat run through the person's own storage placement,
 * which is written at the install's site on first use.
 *
 * The chat-run approve branch starts the conversation's next run, minting a
 * real capability (dispatchService's dispatchChatRun → resolveCapabilityClaims
 * → signCapability), which needs
 * hq's own signing key provisioned — same pattern as dataApi.integration.test.ts.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createWorkerSession, createUser, createTestTask } from '../../test/factories'
import { ensureHqSigningKey } from '../../server/identity/signingKeyService'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

vi.mock('../TaskRunner', () => import('../../test/fakes/TaskRunner'))

const runsById = vi.hoisted(() => new Map<string, any>())
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

// The chat-approve mint lists the run owner's workspaces, which is a read
// across the control channel — there is no site connected to a test process,
// so that one call is faked. Everything else in the mint (site resolution,
// blocked-workspace policy, the boundary and tool intersection) is real. The
// owner here has no workspaces, so an empty listing is the honest answer.
const mockListWorkspacesByOwner = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: mockListWorkspacesByOwner }
})


import { approveManifest, rejectManifest } from '../manifestActions'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { writeAgentContent } from '../../packages/agentPackageService'
import { platformPackage } from './manifestFixtures'

// The site's runs, kept in `runsById` so a test can arrange and inspect them directly.
beforeEach(() => {
  siteStore.getRun.mockImplementation(async (_siteId: string, id: string) => runsById.get(id) ?? null)
  siteStore.rejectRun.mockImplementation(async (_siteId: string, runId: string, reason?: string) => {
    const run = runsById.get(runId)
    if (run) {
      run.status = 'CANCELLED'
      run.manifestStatus = 'REJECTED'
      run.error = reason ?? null
    }
  })
  // site's own run.approve handler: flips manifestStatus to APPROVED, leaving pendingManifest untouched, so a
  // test can assert the carry-forward-relevant fields survive.
  siteStore.approveRun.mockImplementation(async (_siteId: string, runId: string) => {
    const run = runsById.get(runId)
    if (!run || run.manifestStatus !== 'PENDING_APPROVAL') return { approved: false }
    run.manifestStatus = 'APPROVED'
    return { approved: true }
  })
})

// A real user always has a UserSettings row; role defaults to MEMBER
// (schema.prisma) unless overridden.
async function makeUser(role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const user = await createUser()
  await prisma.userSettings.create({ data: { userId: user.id, role, config: {} } })
  return user
}
const ctxFor = (userId: string) => ({ user: { id: userId } }) as any

let taskSeq = 0
async function createTask(data: Record<string, unknown> = {}) {
  // Through the shared factory: a task run's site is resolved from the project
  // holding the task, so a raw project row naming no site refuses before the
  // action under test is reached.
  const project = await createProject({ name: 'P', key: `P${Date.now()}${taskSeq}` })
  return createTestTask({
    data: { title: 'Task', projectId: project.id, number: ++taskSeq, onBehalfOfUserId: 'person-1', ...data } as any,
  })
}

let runSeq = 0
function fakeRun(overrides: Record<string, unknown>) {
  const run = {
    id: `run-${Date.now().toString(36)}-${++runSeq}`,
    status: 'RUNNING',
    manifestStatus: 'PENDING_APPROVAL',
    pendingManifest: { tools: [], bashPatterns: [] },
    taskId: null,
    error: null,
    ...overrides,
  }
  runsById.set(run.id, run)
  return run
}

// Task-run sessions are owned by a fabricated routing identity (see
// TaskRunner's admin fallback) — the caller approving/rejecting is a
// different, real user gated on role, not on matching this session's userId.
async function makeTaskRun(manifestStatus: string) {
  const agent = await createAgent()
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  const routingUser = await makeUser()
  const task = await createTask({ assignedAgentId: agent.id })
  const session = await createSession({ agentId: agent.id, userId: routingUser.id, sessionType: 'task', taskId: task.id })
  // Someone who works in the task's project, who may answer its tool request (adr-0102).
  const operator = await makeUser('MEMBER')
  await prisma.projectMember.create({ data: { projectId: task.projectId, userId: operator.id, role: 'MEMBER' } })
  const run = fakeRun({ sessionId: session.id, agentId: agent.id, taskId: task.id, manifestStatus })
  // approve/reject resolve a task run's site via TaskComment.runId — this
  // comment is what TaskRunner's own status listener creates when the run
  // goes BLOCKED (this file's own history, plan 5d-2 task 9a); mirrored here
  // for realism rather than assuming the resolution mechanism.
  await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorType: 'AGENT',
      agentId: agent.id,
      runId: run.id,
      content: `__MANIFEST_APPROVAL__:${JSON.stringify({ runId: run.id, summary: null, pendingManifest: run.pendingManifest })}`,
    },
  })
  return { agent, session, task, run, operator }
}

async function makeChatRun(owner: { id: string }, manifestStatus = 'PENDING_APPROVAL') {
  const agent = await createAgent()
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  const session = await createWorkerSession({ agentId: agent.id, userId: owner.id, sessionType: 'chat' })
  const run = fakeRun({ sessionId: session.id, agentId: agent.id, taskId: null, manifestStatus })
  return { agent, session, run }
}

describe('approveManifest @SC-183', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    runsById.clear()
    await ensureHqSigningKey()
    await platformPackage()
  })

  it('rejects approving a run that is not PENDING_APPROVAL with 400', async () => {
    const { run, operator } = await makeTaskRun('APPROVED')
    await expect(approveManifest({ runId: run.id }, ctxFor(operator.id))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('approves a task run: re-queues the task and dispatches through taskRunner.runTask', async () => {
    const { task, run, operator } = await makeTaskRun('PENDING_APPROVAL')

    const result = await approveManifest({ runId: run.id }, ctxFor(operator.id))

    expect(result).toEqual({ ok: true })
    expect(taskRunnerFake.taskRunner.runTask).toHaveBeenCalledTimes(1)
    const afterTask = await prisma.task.findUnique({ where: { id: task.id } })
    expect(afterTask?.runState).toBe('RUN_QUEUED')
  })

  it('flips the site run to APPROVED before re-dispatching, so the next run is given what was approved', async () => {
    const { run, operator } = await makeTaskRun('PENDING_APPROVAL')

    await approveManifest({ runId: run.id }, ctxFor(operator.id))

    expect(siteStore.approveRun).toHaveBeenCalledWith(expect.any(String), run.id, operator.id)
    // What the site's next run reads (nextRunApproval.ts) — proved against the
    // same in-memory run row siteRuntimeStore.getRun reads.
    const stored = runsById.get(run.id)
    expect(stored.manifestStatus).toBe('APPROVED')
    expect(stored.pendingManifest).toEqual(run.pendingManifest)
  })

  it('returns 404 when the run does not exist on site', async () => {
    const operator = await makeUser('MEMBER')
    await expect(approveManifest({ runId: 'nope' }, ctxFor(operator.id))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("returns 403 for a task run when the caller is its project's Viewer, and does not dispatch it", async () => {
    const { run, task } = await makeTaskRun('PENDING_APPROVAL')
    const viewer = await makeUser('MEMBER')
    await prisma.projectMember.create({ data: { projectId: task.projectId, userId: viewer.id, role: 'VIEWER' } })
    await expect(approveManifest({ runId: run.id }, ctxFor(viewer.id))).rejects.toMatchObject({ statusCode: 403 })
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it("leaves a run whose task was deleted to the organisation's admins: a Member is refused, and nothing resumes", async () => {
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id, userId: (await makeUser()).id, sessionType: 'task' })
    const run = fakeRun({ sessionId: session.id, agentId: agent.id, taskId: null, manifestStatus: 'PENDING_APPROVAL' })
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor((await makeUser('MEMBER')).id)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.dispatchRun).not.toHaveBeenCalled()
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it("leaves a project's run whose task was deleted to that project's admins", async () => {
    const agent = await createAgent()
    await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
    const project = await createProject()
    const member = await makeUser('MEMBER')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    const session = await createSession({
      agentId: agent.id, userId: (await makeUser()).id, sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: project.id,
    })
    const run = fakeRun({ sessionId: session.id, agentId: agent.id, taskId: null, manifestStatus: 'PENDING_APPROVAL' })
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor((await makeUser('ADMIN')).id)))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).rejects.toMatchObject({ statusCode: 403 })
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.id } }, data: { role: 'ADMIN' } })
    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(member.id))).resolves.toEqual({ ok: true })
  })

  it("approves a chat run: marks the site run APPROVED and starts the conversation's next run", async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner)

    const result = await approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))

    expect(result).toEqual({ ok: true })
    expect(runsById.get(run.id)?.manifestStatus).toBe('APPROVED')
    expect(siteStore.dispatchRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: 'chat', hideUserMessage: true, session: expect.objectContaining({ id: session.id }) }),
    )
  })

  it('the owner of a chat outside any project approves its run whatever their organisation role, no settings row included', async () => {
    const owner = await createUser()
    const { session, run } = await makeChatRun(owner)

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).resolves.toEqual({ ok: true })
    expect(siteStore.dispatchRun).toHaveBeenCalled()
  })

  it('a non-owner is refused approving a chat run with 403, and no run is started @SC-645', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const { session, run } = await makeChatRun(owner)

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(stranger.id)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.dispatchRun).not.toHaveBeenCalled()
  })
})

describe('rejectManifest @SC-184', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    runsById.clear()
    await ensureHqSigningKey()
    await platformPackage()
  })

  it('task run: posts a __MANIFEST_REJECTED__ comment and holds the task for human review (no re-dispatch)', async () => {
    const { task, run, operator } = await makeTaskRun('PENDING_APPROVAL')

    await rejectManifest({ runId: run.id, reason: 'too broad' }, ctxFor(operator.id))

    expect(runsById.get(run.id)?.status).toBe('CANCELLED')
    expect(runsById.get(run.id)?.manifestStatus).toBe('REJECTED')

    const comments = await prisma.taskComment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' } })
    expect(comments.some((c) => c.content.includes('__MANIFEST_REJECTED__'))).toBe(true)

    // Held for human review — BLOCKED, and NOT re-dispatched (F-023).
    const afterTask = await prisma.task.findUnique({ where: { id: task.id } })
    expect(afterTask?.runState).toBe('RUN_BLOCKED')
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it('chat run: the owner rejects and the site run is cancelled', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner)

    await rejectManifest({ runId: run.id, reason: 'no thanks', sessionId: session.id }, ctxFor(owner.id))

    expect(runsById.get(run.id)?.status).toBe('CANCELLED')
    expect(runsById.get(run.id)?.manifestStatus).toBe('REJECTED')
    expect(await prisma.taskComment.count()).toBe(0)
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })

  it('chat run: a non-owner is refused with 403 and the run is not cancelled', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const { session, run } = await makeChatRun(owner)

    await expect(rejectManifest({ runId: run.id, reason: 'no thanks', sessionId: session.id }, ctxFor(stranger.id)))
      .rejects.toMatchObject({ statusCode: 403 })

    expect(runsById.get(run.id)?.status).toBe('RUNNING')
    expect(runsById.get(run.id)?.manifestStatus).toBe('PENDING_APPROVAL')
  })

  it('rejects rejecting a non-PENDING_APPROVAL run with 400', async () => {
    const { run, operator } = await makeTaskRun('APPROVED')
    await expect(rejectManifest({ runId: run.id, reason: 'x' }, ctxFor(operator.id))).rejects.toMatchObject({ statusCode: 400 })
  })
})
