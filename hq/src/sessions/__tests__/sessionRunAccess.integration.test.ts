/**
 * Who may start a run in a session and cancel one (spec §6.4, R-032, R-197),
 * against the real test DB. A task session belongs to its task's project, a
 * chat to its person; a chat bound to a project's storage is re-checked against
 * that project every time it is used. The dispatcher and the site are the
 * shared fakes, so what reached the site is read from them.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createSession, createWorkerSession } from '../../test/factories'
import { ctx, seedSessionCast, setRole, makeProjectViewer } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { triggerAgentRun, cancelAgentRun } from '../actions'
import { getActivitySession } from '../queries'
import { requireStillEntitledToSessionProject } from '../sessionEntitlement'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const dispatched = () => dispatchFake.dispatchedChatRuns.map((r) => r.sessionId)

describe('who may start a run in a session', () => {
  it("a member of the task's project may, and the run is dispatched for that session", async () => {
    const { member, taskSession } = await seedSessionCast()
    const result = await triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(member))
    expect(result).toEqual({ id: expect.any(String), status: 'PENDING' })
    expect(dispatchFake.dispatchedChatRuns).toEqual([expect.objectContaining({ sessionId: taskSession.id, inputText: 'hi', runId: result.id })])
  })

  it('a person cannot send a message that is left out of the transcript, and an empty or oversized one is refused', async () => {
    const { member, taskSession } = await seedSessionCast()
    const hidden = { sessionId: taskSession.id, inputText: 'quiet', hideUserMessage: true } as Parameters<typeof triggerAgentRun>[0]
    await triggerAgentRun(hidden, ctx(member))
    expect(dispatchFake.dispatchChatRun.mock.lastCall?.[4]).toEqual({ senderId: member.id })

    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: '  ' }, ctx(member))).rejects.toMatchObject({ statusCode: 400 })
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'x'.repeat(32_001) }, ctx(member))).rejects.toMatchObject({ statusCode: 400 })
    expect(dispatchFake.dispatchedChatRuns).toHaveLength(1)
  })

  it('an outsider may not, even as an org admin — nothing is dispatched', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(dispatched()).toEqual([])
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(dispatched()).toEqual([])
  })

  it("an open project's task session still takes only its members: a non-member is refused (adr-0099)", async () => {
    const { member, outsiderAdmin, taskSession, project } = await seedSessionCast()
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'OPEN' } })
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(dispatched()).toEqual([])
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(member))).resolves.toMatchObject({ status: 'PENDING' })
    expect(dispatched()).toEqual([taskSession.id])
  })

  it("the project's Viewer may not start a run in its task session (adr-0102)", async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectViewer(project.id, member.id)
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(dispatched()).toEqual([])
  })

  it('an ADMIN and a MEMBER may send a message in their own chat', async () => {
    const { member, chat } = await seedSessionCast()
    await triggerAgentRun({ sessionId: chat.id, inputText: 'as operator' }, ctx(member))
    await setRole(member.id, 'ADMIN')
    await triggerAgentRun({ sessionId: chat.id, inputText: 'as admin' }, ctx(member))
    expect(dispatchFake.dispatchedChatRuns.map((r) => r.inputText)).toEqual(['as operator', 'as admin'])
  })

  it('a missing session answers 404', async () => {
    const { member } = await seedSessionCast()
    await expect(triggerAgentRun({ sessionId: 'does-not-exist', inputText: 'hi' }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('another person may not start a run in that chat (404), and nothing is dispatched', async () => {
    const { outsiderAdmin, chat } = await seedSessionCast()
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(dispatched()).toEqual([])
  })
})

// R-197 / SC-400 / SC-414: membership is checked when a chat is created, so a
// chat bound to a project's storage is re-checked when it is used — a person
// removed from the project, or a project turned private, would otherwise keep
// acting as that project through a chat opened earlier.
describe("a message into a task's session replaces its unanswered request (spec §9)", () => {
  it('a task waiting only for that approval waits no more', async () => {
    const { member, task, taskSession } = await seedSessionCast()
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' } })
    await triggerAgentRun({ sessionId: taskSession.id, inputText: 'Do it another way' }, ctx(member))
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ runState: 'RUN_NONE', runStateReason: null })
  })

  it('a task blocked for another reason stays blocked', async () => {
    const { member, task, taskSession } = await seedSessionCast()
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_BLOCKED', runStateReason: 'Run limit reached: the run was stopped after its turn limit of 100 turns.' } })
    await triggerAgentRun({ sessionId: taskSession.id, inputText: 'Carry on' }, ctx(member))
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).runState).toBe('RUN_BLOCKED')
  })
})

describe('a chat bound to a project keeps working only while its owner still belongs to the project', () => {
  async function projectChat(ownerId: string, projectId: string, agentId: string) {
    return createWorkerSession({ userId: ownerId, agentId, primaryOwnerType: 'project', primaryOwnerId: projectId })
  }

  it('refuses a removed member on send with 403 and dispatches nothing', async () => {
    const { member, project, agent } = await seedSessionCast()
    const chat = await projectChat(member.id, project.id, agent.id)
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: member.id } } })

    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: 'You no longer have access to this project' })
    expect(dispatched()).toEqual([])
  })

  it('lets a current member send and start a run', async () => {
    const { member, project, agent } = await seedSessionCast()
    const chat = await projectChat(member.id, project.id, agent.id)
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(member))).resolves.toMatchObject({ status: 'PENDING' })
    expect(dispatched()).toEqual([chat.id])
  })

  it('refuses a non-member whether the project is open or private, and allows them while they are a member (adr-0099)', async () => {
    const { outsiderAdmin, project, agent } = await seedSessionCast()
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'OPEN' } })
    const chat = await projectChat(outsiderAdmin.id, project.id, agent.id)
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'open, not a member' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })

    await prisma.projectMember.create({ data: { projectId: project.id, userId: outsiderAdmin.id, role: 'MEMBER' } })
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(outsiderAdmin))).resolves.toMatchObject({ status: 'PENDING' })

    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: outsiderAdmin.id } } })
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'again' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(dispatchFake.dispatchedChatRuns.map((r) => r.inputText)).toEqual(['hi'])
  })

  it("leaves a person's own chat in their own storage alone", async () => {
    const { outsiderAdmin, agent } = await seedSessionCast()
    const chat = await createWorkerSession({ userId: outsiderAdmin.id, agentId: agent.id, primaryOwnerType: 'user', primaryOwnerId: outsiderAdmin.id })
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(outsiderAdmin))).resolves.toMatchObject({ status: 'PENDING' })
  })

  it('still answers a non-owner 404 before the membership question, so it tells them nothing', async () => {
    const { member, outsiderAdmin, project, agent } = await seedSessionCast()
    const chat = await projectChat(member.id, project.id, agent.id)
    await expect(triggerAgentRun({ sessionId: chat.id, inputText: 'hi' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('keeps read access to their own old transcript there', async () => {
    const { outsiderAdmin, project, agent } = await seedSessionCast()
    const chat = await projectChat(outsiderAdmin.id, project.id, agent.id)
    const result = await getActivitySession({ sessionId: chat.id }, ctx(outsiderAdmin))
    expect(result.id).toBe(chat.id)
  })

  it('passes a session with no project location, and refuses a project that no longer exists', async () => {
    const { outsiderAdmin, member } = await seedSessionCast()
    await expect(requireStillEntitledToSessionProject({ primaryOwnerType: null, primaryOwnerId: null }, outsiderAdmin.id)).resolves.toBeUndefined()
    await expect(requireStillEntitledToSessionProject({}, outsiderAdmin.id)).resolves.toBeUndefined()
    await expect(requireStillEntitledToSessionProject({ primaryOwnerType: 'project', primaryOwnerId: 'gone' }, member.id))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('who may cancel a run', () => {
  function running(sessionId: string) {
    return siteStore.addRun(SITE, { id: `run-${sessionId}`, sessionId, status: 'RUNNING' })
  }
  async function statusOf(runId: string) {
    return (await siteStore.getRun(SITE, runId))?.status
  }

  it("a member of the task's project may cancel a run on its session", async () => {
    const { member, taskSession } = await seedSessionCast()
    const run = running(taskSession.id)
    await cancelAgentRun({ runId: run.id, sessionId: taskSession.id }, ctx(member))
    expect(await statusOf(run.id)).toBe('CANCELLED')
  })

  it('an outsider may not — the run is never even looked up, let alone cancelled', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    const run = running(taskSession.id)
    await expect(cancelAgentRun({ runId: run.id, sessionId: taskSession.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.getRun).not.toHaveBeenCalled()
    expect(await statusOf(run.id)).toBe('RUNNING')
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    const run = running(taskSession.id)
    await expect(cancelAgentRun({ runId: run.id, sessionId: taskSession.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await statusOf(run.id)).toBe('RUNNING')
  })

  it('a missing session answers 404', async () => {
    const { member } = await seedSessionCast()
    await expect(cancelAgentRun({ runId: 'run-1', sessionId: 'does-not-exist' }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a person may cancel a run on their own chat; another person is answered 404 and nothing is cancelled', async () => {
    const { member, outsiderAdmin, chat } = await seedSessionCast()
    const run = running(chat.id)
    await expect(cancelAgentRun({ runId: run.id, sessionId: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(await statusOf(run.id)).toBe('RUNNING')

    await cancelAgentRun({ runId: run.id, sessionId: chat.id }, ctx(member))
    expect(await statusOf(run.id)).toBe('CANCELLED')
  })

  it('refuses a run that belongs to another session, though the caller owns the session they named', async () => {
    const { member, chat, taskSession } = await seedSessionCast()
    const foreign = running(taskSession.id)
    await expect(cancelAgentRun({ runId: foreign.id, sessionId: chat.id }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
    expect(await statusOf(foreign.id)).toBe('RUNNING')
  })

  it("the project's Viewer may not cancel a run in its task session (403 saying so) — the run is never looked up", async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectViewer(project.id, member.id)
    const run = running(taskSession.id)
    await expect(cancelAgentRun({ runId: run.id, sessionId: taskSession.id }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(siteStore.getRun).not.toHaveBeenCalled()
    expect(await statusOf(run.id)).toBe('RUNNING')
  })
})
