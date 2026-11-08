/**
 * What a task run's end does besides its run state, against the real database (@SC-339, adr-0089): a run ending
 * on a tool request blocks the task, writes the approval comment once and tells the person the task is done on
 * behalf of; a task blocked for its person's lost access stays blocked and asks nobody; a finished or failed
 * run archives that task's own session on both sides — never another session the frame names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createSession } from '../../test/factories'
import { addTask, agentInProject, frame, settle, stateOf } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import '../TaskRunner'
import { MANIFEST_BLOCKED_REASON } from '../taskExecutionReasons'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import { TOOL_APPROVAL_NOTIFICATION_TYPE } from '../approvalNotification'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = dispatchFake.DEFAULT_SITE_ID
const listen = (e: unknown) => listeners.get('task-machine')!(e, SITE)
const pending = { manifestPending: { runId: 'run-1', summary: 'The draft is ready. I need Bash to check the links.', pendingManifest: { tools: [{ name: 'Bash' }], bashPatterns: [] } } }
const approvalComments = (taskId: string) =>
  prisma.taskComment.findMany({ where: { taskId, content: { startsWith: '__MANIFEST_APPROVAL__:' } } })

async function running(data: Record<string, unknown> = {}) {
  const where = await agentInProject()
  const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1', ...data })
  const next = await addTask(where, { runStartedBy: 'person' })
  return { ...where, task, next }
}

describe('a run ending on a tool request', () => {
  it('blocks the task for approval whatever the frame status, comments, tells its person, and frees the slot', async () => {
    const { task, next, person, agent } = await running()
    const emitted: string[] = []
    ;(globalThis as any).__wasp_io__ = { to: () => ({ emit: (event: string) => { emitted.push(event) } }) }
    try {
      await listen(frame(task.id, 'run-1', { status: 'FAILED', error: 'x', agentId: agent.id, ...pending }))
      await settle()
    } finally {
      delete (globalThis as any).__wasp_io__
    }

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: MANIFEST_BLOCKED_REASON })
    const [comment] = await approvalComments(task.id)
    expect(comment).toMatchObject({ authorType: 'AGENT', runId: 'run-1' })
    // Why it asks, never the rest of its reply.
    expect(JSON.parse(comment.content.slice('__MANIFEST_APPROVAL__:'.length))).toEqual({ ...pending.manifestPending, summary: 'I need Bash to check the links.' })
    const notes = await prisma.notification.findMany({ where: { userId: person.id } })
    expect(notes).toEqual([expect.objectContaining({ type: TOOL_APPROVAL_NOTIFICATION_TYPE, body: expect.stringContaining('I need Bash to check the links.') })])
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
    // The site's own stream frame already reaches the task room.
    expect(emitted).not.toContain('manifestPendingApproval')
  })

  it('a duplicate frame for the same request writes no second comment', async () => {
    const { task, agent } = await running()
    await listen(frame(task.id, 'run-1', { agentId: agent.id, ...pending }))
    await listen(frame(task.id, 'run-1', { agentId: agent.id, ...pending }))
    expect(await approvalComments(task.id)).toHaveLength(1)
  })
})

// Blocking it settled its run first (lossOfAccess.ts), so the conditional settle matches nothing.
describe('a task blocked because its person lost access', () => {
  it.each(['CANCELLED', 'COMPLETED', 'FAILED'] as const)('a %s frame leaves it blocked and frees the agent\'s slot', async (status) => {
    const { task, next } = await running({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    await listen(frame(task.id, 'run-1', { status }))
    await settle()
    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
  })

  it('a tool request from its last run asks nobody', async () => {
    const { task, person } = await running({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    await listen(frame(task.id, 'run-1', pending))
    expect(await approvalComments(task.id)).toHaveLength(0)
    expect(await prisma.notification.count({ where: { userId: person.id } })).toBe(0)
  })
})

describe("a task's run end archives only that task's session", () => {
  /** A running task with its session on hq and on the site. */
  async function withSession() {
    const made = await running()
    const session = await createSession({ agentId: made.agent.id, userId: made.person.id, sessionType: 'task', taskId: made.task.id })
    siteStore.addSession(SITE, { id: session.id, taskId: made.task.id, sessionType: 'task' })
    return { ...made, session }
  }
  const hqStatus = async (id: string) => (await prisma.agentSession.findUniqueOrThrow({ where: { id } })).status
  const siteStatus = async (id: string) => (await siteStore.getSession(SITE, id))?.status

  it.each(['COMPLETED', 'FAILED'] as const)('a %s run archives the session on both sides', async (status) => {
    const { task, session } = await withSession()
    await listen(frame(task.id, 'run-1', { status, sessionId: session.id }))
    expect(await siteStatus(session.id)).toBe('ARCHIVED')
    expect(await hqStatus(session.id)).toBe('ARCHIVED')
  })

  it('a stopped run leaves the session open for the run that follows', async () => {
    const { task, session } = await withSession()
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: 'cancelled', sessionId: session.id }))
    expect(await siteStatus(session.id)).toBe('ACTIVE')
    expect(await hqStatus(session.id)).toBe('ACTIVE')
  })

  it("leaves hq's copy alone when the site's archive fails — hq mirrors the site, never leads it", async () => {
    const { task, session } = await withSession()
    siteStore.archiveSession.mockRejectedValueOnce(new Error('site unreachable'))
    await listen(frame(task.id, 'run-1', { sessionId: session.id }))
    expect(await hqStatus(session.id)).toBe('ACTIVE')
    expect((await stateOf(task.id)).runState).toBe('RUN_NONE')
  })

  it("archives nothing when the frame names another task's session, a chat, or none hq knows — but still settles and starts the next", async () => {
    const { task, next, agent, person } = await withSession()
    const otherTask = await addTask({ project: { id: task.projectId }, agent: null, person })
    const theirs = await createSession({ agentId: agent.id, userId: person.id, sessionType: 'task', taskId: otherTask.id })
    const chat = await createSession({ agentId: agent.id, userId: person.id, sessionType: 'chat' })
    for (const id of [theirs.id, chat.id]) siteStore.addSession(SITE, { id })

    for (const sessionId of [theirs.id, chat.id, 'no-such-session']) {
      await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE' } })
      await listen(frame(task.id, 'run-1', { sessionId }))
    }
    await settle()

    expect(await hqStatus(theirs.id)).toBe('ACTIVE')
    expect(await hqStatus(chat.id)).toBe('ACTIVE')
    expect(await siteStatus(theirs.id)).toBe('ACTIVE')
    expect(await siteStatus(chat.id)).toBe('ACTIVE')
    expect((await stateOf(task.id)).runState).toBe('RUN_NONE')
    expect((await stateOf(next.id)).runState).toBe('RUN_ACTIVE')
  })

  it('archives nothing when the session cannot be read', async () => {
    const { task, session } = await withSession()
    const read = vi.spyOn(prisma.agentSession, 'findUnique').mockRejectedValueOnce(new Error('connection reset'))
    try {
      await listen(frame(task.id, 'run-1', { sessionId: session.id }))
    } finally {
      read.mockRestore()
    }
    expect(await siteStatus(session.id)).toBe('ACTIVE')
    expect(await hqStatus(session.id)).toBe('ACTIVE')
  })
})
