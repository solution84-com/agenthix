/**
 * Approving in a task's shared session (every-screen-reviewed spec §3, §9), against the real database: anyone
 * on the task's project who may start runs approves, whoever the task or the run is for; a viewer does not; an
 * approval never changes whose behalf the run is on; and approving a run started by a message into the session
 * starts the session's next run, as its sender's, only while they are still on the project. The runs live on the siteRuntimeStore fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PendingManifest } from '@agenthix/core'
import { prisma } from '../../test/db'
import { ensureHqSigningKey } from '../../server/identity/signingKeyService'
import { ctxFor, makeMember, makeTaskRun, makeUser, privateProject, platformPackage } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { approveManifest } from '../manifestActions'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

beforeEach(async () => {
  await ensureHqSigningKey()
  await platformPackage()
})

describe("anyone on the task's project who may start runs may approve its tool request @SC-518 @SC-521 @SC-640", () => {
  it('a member who is neither the task\'s person nor its starter approves, and the run stays its starter\'s', async () => {
    const starter = await makeUser()
    const colleague = await makeUser('MEMBER')
    const { task, run } = await makeTaskRun({ project: await privateProject([starter, colleague]), runStartedBy: 'person' })
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: starter.id } })

    await expect(approveManifest({ runId: run.id }, ctxFor(colleague.id))).resolves.toEqual({ ok: true })

    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'person', personId: starter.id })])
  })

  it("the project's Viewer only watches, even as the organisation's admin (adr-0102)", async () => {
    const viewer = await makeUser('ADMIN')
    const { run } = await makeTaskRun({ project: await privateProject([viewer], {}, 'VIEWER') })

    await expect(approveManifest({ runId: run.id }, ctxFor(viewer.id))).rejects.toMatchObject({ statusCode: 403 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
  })

  it('a run nobody started is re-run as nobody\'s, whoever approves it', async () => {
    const { task, run, project } = await makeTaskRun({ runStartedBy: 'pulse' })
    const operator = await makeMember(project)

    await approveManifest({ runId: run.id }, ctxFor(operator.id))

    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, startedBy: 'pulse', personId: null })])
  })
})

describe("a run started by a message into the task's session @SC-521 @SC-641", () => {
  async function messageRun() {
    const sender = await makeUser()
    const colleague = await makeUser('MEMBER')
    const made = await makeTaskRun({ project: await privateProject([sender, colleague]) })
    // The message replaced the task run's request, and its own run is the newest in the session.
    made.run.manifestStatus = 'SUPERSEDED'
    made.run.createdAt = '2026-10-01T00:00:00.000Z'
    // A message into the session runs as a chat turn there: no task on the run, its sender recorded on it.
    const run = siteStore.addRun(made.siteId, {
      id: `msg-${made.task.id}`, sessionId: made.session.id, agentId: made.agent.id, taskId: null, createdAt: '2026-10-02T00:00:00.000Z',
      status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: ['bash'], bashPatterns: [] } as unknown as PendingManifest,
      metadata: { dispatch: { kind: 'chat', startedBy: 'person', onBehalfOfUserId: sender.id } },
    })
    return { ...made, run, sender, colleague }
  }

  it("is approved by anyone on the project, and the session's next run goes on as its sender's", async () => {
    const { run, session, colleague, sender, siteId } = await messageRun()

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(colleague.id))).resolves.toEqual({ ok: true })

    expect(run.manifestStatus).toBe('APPROVED')
    expect(siteStore.dispatchedRuns).toEqual([{
      siteId,
      payload: expect.objectContaining({ kind: 'chat', hideUserMessage: true, onBehalfOfUserId: sender.id }),
    }])
  })

  it('starts nothing once its sender has left the project', async () => {
    const { run, session, colleague, project, sender } = await messageRun()
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: sender.id } } })

    await expect(approveManifest({ runId: run.id, sessionId: session.id }, ctxFor(colleague.id))).rejects.toMatchObject({ statusCode: 409 })
    expect(run.manifestStatus).toBe('PENDING_APPROVAL')
    expect(siteStore.dispatchedRuns).toHaveLength(0)
  })
})
