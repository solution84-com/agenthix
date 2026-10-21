/**
 * Who a task is done on behalf of (adr-0089), against the real test DB: reading
 * it names the person and who queued it, and shows a project admin whom it may
 * be given to; giving it to someone is the project admin's, only to a person
 * who can reach the project, and releases a block for lost access.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { getTaskOnBehalfOf, setTaskOnBehalfOf } from '../onBehalfOfOperations'
import { LOST_ACCESS_REASON } from '../taskOnBehalfOf'

const person = (username: string) =>
  createUser({ auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } } } })
const as = (user: { id: string } | null) => ({ user })

/** A private project administered by alice, with dana and erin as members, and outsider outside it. */
async function team() {
  const alice = await person('alice')
  const dana = await person('dana')
  const erin = await person('erin')
  const outsider = await person('outsider')
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.createMany({ data: [
    { projectId: project.id, userId: alice.id, role: 'ADMIN' },
    { projectId: project.id, userId: dana.id, role: 'MEMBER' },
    { projectId: project.id, userId: erin.id, role: 'MEMBER' },
  ] })
  return { alice, dana, erin, outsider, project }
}

describe('getTaskOnBehalfOf', () => {
  it('names the person and the agent and run that queued the task, and offers a member nothing to reassign', async () => {
    const { dana, project } = await team()
    const agent = await createAgent({ name: 'Atlas', handle: 'atlas' })
    const task = await makeTask(project.id, { onBehalfOfUserId: dana.id, queuedByAgentId: agent.id, queuedBySessionId: 'sess-1' })

    expect(await getTaskOnBehalfOf({ taskId: task.id }, as(dana))).toEqual({
      onBehalfOf: { userId: dana.id, username: 'dana', hasAccess: true },
      queuedBy: { kind: 'agent', agentId: agent.id, agentName: 'Atlas', agentHandle: 'atlas', sessionId: 'sess-1' },
      blockedForLostAccess: false,
      canReassign: false,
      candidates: [],
    })
  })

  it('shows a project admin a removed person, the block, and who it may go to', async () => {
    const { alice, project } = await team()
    const task = await makeTask(project.id, { onBehalfOfUserId: 'gone', queuedByUserId: 'gone', runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })

    const result = await getTaskOnBehalfOf({ taskId: task.id }, as(alice))

    expect(result?.onBehalfOf).toEqual({ userId: 'gone', username: 'Former member', hasAccess: false })
    expect(result?.queuedBy).toEqual({ kind: 'person', person: { userId: 'gone', username: 'Former member' } })
    expect(result?.blockedForLostAccess).toBe(true)
    expect(result?.canReassign).toBe(true)
    expect(result?.candidates.map((c) => c.username)).toEqual(['alice', 'dana', 'erin'])
  })

  it('answers a caller outside the project as not found, and one not signed in with 401', async () => {
    const { dana, outsider, project } = await team()
    const task = await makeTask(project.id, { onBehalfOfUserId: dana.id })
    await expect(getTaskOnBehalfOf({ taskId: task.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getTaskOnBehalfOf({ taskId: task.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('setTaskOnBehalfOf', () => {
  async function blockedTask() {
    const t = await team()
    const task = await makeTask(t.project.id, { onBehalfOfUserId: 'gone', runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    return { ...t, task }
  }
  const fresh = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

  it('a project admin hands the task to a member, which releases a loss-of-access block to idle and says so on the task', async () => {
    const { alice, erin, task } = await blockedTask()

    await expect(setTaskOnBehalfOf({ taskId: task.id, userId: erin.id }, as(alice))).resolves.toEqual({ ok: true })

    expect(await fresh(task.id)).toMatchObject({ onBehalfOfUserId: erin.id, runState: 'RUN_NONE', runStateReason: null })
    expect(await prisma.taskComment.findMany({ where: { taskId: task.id } }))
      .toEqual([expect.objectContaining({ authorType: 'USER', userId: alice.id, content: expect.stringContaining('erin') })])
  })

  it('leaves any other run state alone when the task was not blocked for loss of access', async () => {
    const { alice, dana, erin, project } = await team()
    const task = await makeTask(project.id, { onBehalfOfUserId: dana.id, runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })
    await setTaskOnBehalfOf({ taskId: task.id, userId: erin.id }, as(alice))
    expect(await fresh(task.id)).toMatchObject({ onBehalfOfUserId: erin.id, runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })
  })

  it("refuses anyone who is not this project's admin, a person who cannot reach the project, and a caller not signed in", async () => {
    const { alice, dana, erin, outsider, task } = await blockedTask()
    await expect(setTaskOnBehalfOf({ taskId: task.id, userId: erin.id }, as(dana))).rejects.toMatchObject({ statusCode: 403 })
    await expect(setTaskOnBehalfOf({ taskId: task.id, userId: outsider.id }, as(alice))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setTaskOnBehalfOf({ taskId: task.id, userId: erin.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(await fresh(task.id)).toMatchObject({ onBehalfOfUserId: 'gone', runState: 'RUN_BLOCKED' })
    expect(await prisma.taskComment.count()).toBe(0)
  })
})
