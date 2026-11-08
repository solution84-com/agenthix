/**
 * What approving and rejecting a pending tool manifest does, against the real database: which run it finds, how
 * a task is re-queued or held, who it is re-queued as, how a conversation's next run is started, that a replaced
 * request cannot be answered, and what the site and the browsers are told. The runs
 * themselves live on the site, held here by the siteRuntimeStore fake; site resolution and capability minting
 * are real. Who may approve is in manifest.integration and manifestEntitlement.integration.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { ensureHqSigningKey } from '../../server/identity/signingKeyService'
import { ctxFor, makeChatRun, makeMember, makeTaskRun, makeUser, privateProject, secondSite, platformPackage } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  // Listing a person's workspaces asks the site; this person has none.
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { approveManifest, rejectManifest } from '../manifestActions'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const emit = vi.fn()
const rooms = vi.fn(() => ({ emit }))

beforeEach(async () => {
  socket.emitTaskUpdated.mockReset()
  emit.mockReset()
  rooms.mockClear()
  ;(globalThis as any).__wasp_io__ = { to: rooms }
  await ensureHqSigningKey()
  await platformPackage()
})

afterEach(() => {
  ;(globalThis as any).__wasp_io__ = undefined
})

const taskRow = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('approveManifest finds the run', () => {
  it('refuses a caller who is not signed in', async () => {
    const { run } = await makeTaskRun()
    await expect(approveManifest({ runId: run.id }, { user: null })).rejects.toMatchObject({ statusCode: 401 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
  })

  it('finds a task run through the comment naming it, with no session given', async () => {
    const { run, project } = await makeTaskRun()
    const operator = await makeMember(project)
    await expect(approveManifest({ runId: run.id }, ctxFor(operator.id))).resolves.toEqual({ ok: true })
    expect(run.manifestStatus).toBe('APPROVED')
  })

  it('a chat run with no session given is not found, and stays pending', async () => {
    const owner = await makeUser()
    const { run } = await makeChatRun(owner)
    await expect(approveManifest({ runId: run.id }, ctxFor(owner.id))).rejects.toMatchObject({ statusCode: 404 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
  })

  it("finds a chat run bound to a project on another site, through its session's location", async () => {
    const owner = await makeUser()
    const site = await secondSite()
    const project = await privateProject([owner], { executionSiteId: site.id })
    const { session, run } = await makeChatRun(owner, project)

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).resolves.toEqual({ ok: true })
    expect(siteStore.approveRun).toHaveBeenCalledWith(site.siteId, run.id, owner.id)
    expect(siteStore.dispatchedRuns).toEqual([expect.objectContaining({ siteId: site.siteId })])
  })
})

describe('approving a task run re-queues it @SC-640', () => {
  it('as the person who approved it, at depth 0, keeping what started its run', async () => {
    const { task, run, project } = await makeTaskRun({ runStartedBy: 'schedule' })
    const operator = await makeMember(project)

    await approveManifest({ runId: run.id }, ctxFor(operator.id))

    expect(await taskRow(task.id)).toMatchObject({
      runState: 'RUN_QUEUED', queueDepth: 0, runStartedBy: 'schedule', runOnBehalfOfUserId: null,
      queuedByUserId: operator.id, queuedByAgentId: null, queuedBySessionId: null,
    })
    // A person approving a tool does not make a run a start time started theirs.
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'schedule' })])
  })

  it("a run whose starter it cannot read is re-run as an agent's, never a person's", async () => {
    const { task, run, project } = await makeTaskRun({ runStartedBy: 'pulse' })
    await approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id))
    expect(await taskRow(task.id)).toMatchObject({ runStartedBy: 'agent', runOnBehalfOfUserId: null })
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'agent' })])
  })

  it('a run a person started is re-run as theirs', async () => {
    const { task, run, project } = await makeTaskRun({ runStartedBy: 'person' })
    await approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id))
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'person' })])
  })

  it('marks the site run approved before the task is queued, and starts the new run only after both', async () => {
    const { task, run, project } = await makeTaskRun()
    const seen: string[] = []
    siteStore.approveRun.mockImplementationOnce(async () => {
      seen.push(`approve: task ${(await taskRow(task.id)).runState}`)
      run.manifestStatus = 'APPROVED'
      return { approved: true }
    })
    taskRunnerFake.taskRunner.runTask.mockImplementationOnce(async () => {
      seen.push(`start: run ${run.manifestStatus}, task ${(await taskRow(task.id)).runState}`)
      return { outcome: 'started' }
    })

    await approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id))
    await vi.waitFor(() => expect(seen).toHaveLength(2))

    expect(seen).toEqual(['approve: task RUN_BLOCKED', 'start: run APPROVED, task RUN_QUEUED'])
    // Re-run through the ordinary claim, never as a conversation's next run.
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it("tells the task's board", async () => {
    const { run, project } = await makeTaskRun()
    await approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id))
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(project.id)
  })

  it('when the site says the run is no longer pending, answers 409 and leaves the task held', async () => {
    const { task, run, project } = await makeTaskRun()
    siteStore.approveRun.mockResolvedValueOnce({ approved: false })

    await expect(approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id))).rejects.toMatchObject({ statusCode: 409 })

    expect((await taskRow(task.id)).runState).toBe('RUN_BLOCKED')
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
  })
})

describe("approving a conversation's request starts its next run @SC-641", () => {
  it('marks the request approved on the site holding it, then sends the conversation a hidden message as its owner', async () => {
    const owner = await makeUser()
    const { session, run, siteId } = await makeChatRun(owner)
    const order: string[] = []
    siteStore.approveRun.mockImplementationOnce(async () => {
      order.push(`approve: ${siteStore.dispatchedRuns.length} dispatched`)
      run.manifestStatus = 'APPROVED'
      return { approved: true }
    })

    await approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))

    expect(order).toEqual(['approve: 0 dispatched'])
    expect(siteStore.dispatchedRuns).toEqual([{
      siteId,
      payload: expect.objectContaining({
        kind: 'chat', inputText: 'Please continue.', hideUserMessage: true,
        session: expect.objectContaining({ id: session.id }),
      }),
    }])
    expect(run.manifestStatus).toBe('APPROVED')
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
  })

  it('when the site says the request is no longer pending, answers 409 and starts nothing', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner)
    siteStore.approveRun.mockResolvedValueOnce({ approved: false })

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id))).rejects.toMatchObject({ statusCode: 409 })
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })
})

describe('a replaced request cannot be answered @SC-642', () => {
  const REFUSAL = /replaced by something newer in its task or conversation/

  it('approving one the site marked replaced is refused with a plain sentence, and starts nothing', async () => {
    const { task, run, project } = await makeTaskRun({ manifestStatus: 'SUPERSEDED' })

    await expect(approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(REFUSAL) })

    expect((await taskRow(task.id)).runState).toBe('RUN_BLOCKED')
    expect(siteStore.approveRun).not.toHaveBeenCalled()
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
  })

  it('approving one a newer run of its conversation overtook is refused, and the old request is replaced', async () => {
    const owner = await makeUser()
    const { session, run, siteId, agent } = await makeChatRun(owner)
    run.createdAt = '2026-10-01T00:00:00.000Z'
    siteStore.addRun(siteId, { id: `newer-${run.id}`, sessionId: session.id, agentId: agent.id, status: 'RUNNING', createdAt: '2026-10-02T00:00:00.000Z' })

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(owner.id)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(REFUSAL) })

    expect(run.manifestStatus).toBe('SUPERSEDED')
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })

  it("approving an older request while the task's newer run is going is refused, and the going run is left alone", async () => {
    const { task, run, project } = await makeTaskRun()
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE', runId: 'run-newer' } })

    await expect(approveManifest({ runId: run.id }, ctxFor((await makeMember(project)).id)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(REFUSAL) })

    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runId: 'run-newer' })
    expect(siteStore.approveRun).not.toHaveBeenCalled()
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
  })

  it('denying a replaced request is refused with the same sentence, and writes nothing', async () => {
    const { task, run, project } = await makeTaskRun({ manifestStatus: 'SUPERSEDED' })

    await expect(rejectManifest({ runId: run.id, reason: 'no' }, ctxFor((await makeMember(project)).id)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(REFUSAL) })

    expect(siteStore.rejectRun).not.toHaveBeenCalled()
    expect(await prisma.taskComment.count({ where: { taskId: task.id, content: { startsWith: '__MANIFEST_REJECTED__' } } })).toBe(0)
  })
})

describe('rejecting a task run', () => {
  it('tells the site why, comments on the task, holds it for a person and tells its board and room', async () => {
    const { task, run, siteId, project } = await makeTaskRun()

    const member = await makeMember(project)
    await expect(rejectManifest({ runId: run.id, reason: 'Too broad' }, ctxFor(member.id))).resolves.toEqual({ ok: true })

    expect(siteStore.rejectRun).toHaveBeenCalledWith(siteId, run.id, 'Too broad', member.id)
    expect(run.manifestStatus).toBe('REJECTED')
    const comments = await prisma.taskComment.findMany({ where: { taskId: task.id, runId: run.id }, orderBy: { createdAt: 'asc' } })
    expect(comments.map(c => c.content)).toContain('__MANIFEST_REJECTED__: Too broad')
    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: 'manifest rejected — awaiting human review' })
    expect(taskRunnerFake.startedTasks).toHaveLength(0)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(project.id)
    expect(rooms).toHaveBeenCalledWith(`task:${task.id}`)
    expect(emit).toHaveBeenCalledWith('manifestRejected', { runId: run.id, taskId: task.id, reason: 'Too broad' })
  })

  it("leaves a newer run's state alone when it is declined after that run was claimed", async () => {
    const { task, run, project } = await makeTaskRun()
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE', runId: 'run-newer' } })

    await expect(rejectManifest({ runId: run.id, reason: 'no' }, ctxFor((await makeMember(project)).id))).resolves.toEqual({ ok: true })

    expect(await taskRow(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runId: 'run-newer' })
  })

  it("is refused for the project's Viewer, leaving the run pending (adr-0102)", async () => {
    const { run, project } = await makeTaskRun()
    const viewer = await makeMember(project, 'VIEWER')
    await expect(rejectManifest({ runId: run.id, reason: 'no' }, ctxFor(viewer.id))).rejects.toMatchObject({ statusCode: 403 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
  })
})

describe('rejecting a chat run @SC-641', () => {
  it('starts the conversation\'s next run, told what was denied, sending no message of the person\'s', async () => {
    const owner = await makeUser()
    const { session, run, siteId } = await makeChatRun(owner)

    await rejectManifest({ runId: run.id, reason: 'Not on main', sessionId: session.id }, ctxFor(owner.id))

    expect(run.manifestStatus).toBe('REJECTED')
    expect(siteStore.dispatchedRuns).toEqual([{
      siteId,
      payload: expect.objectContaining({
        kind: 'chat', hideUserMessage: true, session: expect.objectContaining({ id: session.id }),
        inputText: expect.stringContaining('A person denied your request'),
      }),
    }])
    expect(siteStore.dispatchedRuns[0].payload.inputText).toContain('Their reason: Not on main')
  })

  it('writes no task comment and tells the session room', async () => {
    const owner = await makeUser()
    const { session, run } = await makeChatRun(owner)

    await rejectManifest({ runId: run.id, reason: 'Too much', sessionId: session.id }, ctxFor(owner.id))

    expect(run.manifestStatus).toBe('REJECTED')
    expect(await prisma.taskComment.count()).toBe(0)
    expect(rooms).toHaveBeenCalledWith(`session:${session.id}`)
    expect(emit).toHaveBeenCalledWith('manifestRejected', { runId: run.id, sessionId: session.id, reason: 'Too much' })
  })
})
