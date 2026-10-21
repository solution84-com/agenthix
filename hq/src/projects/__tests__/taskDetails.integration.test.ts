/**
 * Details a task carries, against the real test DB: the reason shown for a
 * task held on a site that needs an upgrade (R-033), the comments on it
 * (SC-041).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { ctx, makeBoard, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { withDisplayReasons, withDisplayReason } from '../taskReasonDisplay'
import { getTasks, getTask } from '../queries'
import { createTaskComment } from '../projectService'
import { HELD_FOR_RECONNECT_REASON } from '../../agents/taskExecutionReasons'
import { HELD_FOR_UPGRADE_DISPLAY } from '../../agents/taskDisplayReason'

// R-033: shown as waiting for an upgrade; the stored reason, which the drain,
// claim, re-hold and revoke sweep match on, is never rewritten.
describe('the reason shown for a held task', () => {
  async function projectOn(status: string) {
    const site = await prisma.executionSite.create({ data: { siteId: `site-${status}-${Math.random()}`, label: status, status } })
    return createProject({ accessLevel: 'OPEN', executionSiteId: site.id })
  }
  const held = (projectId: string) => makeTask(projectId, { runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON })

  it('is the upgrade reason for a task held on a site with a version mismatch, and only for its tasks', async () => {
    const mismatched = await projectOn('VERSION_MISMATCH')
    const offline = await projectOn('OFFLINE')
    const a = await held(mismatched.id)
    const b = await held(offline.id)

    const [shownA, shownB] = await withDisplayReasons([a, b])

    expect(shownA.runStateReason).toBe(HELD_FOR_UPGRADE_DISPLAY)
    // Merely offline: the held reason stands.
    expect(shownB.runStateReason).toBe(HELD_FOR_RECONNECT_REASON)
    expect(a.runStateReason).toBe(HELD_FOR_RECONNECT_REASON)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).runStateReason).toBe(HELD_FOR_RECONNECT_REASON)
  })

  it('leaves a task that is not held as it is, and passes null through', async () => {
    const mismatched = await projectOn('VERSION_MISMATCH')
    const running = await makeTask(mismatched.id, { runState: 'RUN_ACTIVE', runStateReason: 'execution slot available' })
    expect(await withDisplayReasons([running])).toEqual([running])
    await expect(withDisplayReason(null)).resolves.toBeNull()
    await expect(withDisplayReason(await held(mismatched.id))).resolves.toMatchObject({ runStateReason: HELD_FOR_UPGRADE_DISPLAY })
  })

  it('is what the browser reads of a task carry', async () => {
    const mismatched = await projectOn('VERSION_MISMATCH')
    const task = await held(mismatched.id)
    const reader = await createUser()
    await prisma.projectMember.create({ data: { projectId: mismatched.id, userId: reader.id } })
    expect((await getTasks({ projectId: mismatched.id }, ctx(reader)))[0].runStateReason).toBe(HELD_FOR_UPGRADE_DISPLAY)
    expect((await getTask({ taskId: task.id }, ctx(reader)))!.runStateReason).toBe(HELD_FOR_UPGRADE_DISPLAY)
  })
})

describe('createTaskComment @SC-041', () => {
  const emit = vi.fn()
  const to = vi.fn(() => ({ emit }))
  beforeEach(() => {
    emit.mockClear()
    to.mockClear()
    ;(globalThis as any).__wasp_io__ = { to }
  })

  it("stores an agent's comment and tells the task's room, naming the agent", async () => {
    const task = await makeTask((await createProject()).id)
    const agent = await createAgent({ name: 'Aria', handle: 'aria' })

    const comment = await createTaskComment({ taskId: task.id, authorType: 'AGENT', agentId: agent.id, runId: 'run-1', content: 'Work done.' })

    expect(await prisma.taskComment.findUniqueOrThrow({ where: { id: comment.id } }))
      .toMatchObject({ taskId: task.id, authorType: 'AGENT', agentId: agent.id, runId: 'run-1', content: 'Work done.' })
    expect(to).toHaveBeenCalledWith(`task:${task.id}`)
    expect(emit).toHaveBeenCalledWith('taskCommentAdded', expect.objectContaining({ id: comment.id, agentName: 'Aria', agentHandle: 'aria' }))
  })

  it("stores a person's comment, with no agent", async () => {
    const task = await makeTask((await createProject()).id)
    const user = await createUser()
    const comment = await createTaskComment({ taskId: task.id, authorType: 'USER', userId: user.id, content: 'Looks good!' })
    expect(comment).toMatchObject({ authorType: 'USER', userId: user.id, agentId: null, runId: null })
    expect(emit).toHaveBeenCalledWith('taskCommentAdded', expect.objectContaining({ id: comment.id, authorType: 'USER', agentName: null }))
  })
})
