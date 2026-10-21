/**
 * The Runs panel's read (spec §6): the person's own runs — started by them or
 * done on their behalf (adr-0089) — grouped, with who started each one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createSession, createProject, ensureExecutionSite, createTestTask } from '../../test/factories'
import { ctx } from '../../sessions/__tests__/sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getMyRuns, getMyRunsGoingCount } from '../queries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
let seq = 0

beforeEach(async () => {
  await ensureExecutionSite({ siteId: SITE, protocolVersion: SITE_PROTOCOL_VERSION })
})

async function cast() {
  const me = await createUserWithRole('MEMBER')
  const other = await createUserWithRole('MEMBER')
  const agent = await createAgent()
  const project = await createProject()
  await prisma.projectMember.createMany({ data: [me, other].map(u => ({ projectId: project.id, userId: u.id })) })
  const task = (data: Record<string, unknown>) =>
    createTestTask({ data: { title: `Task ${++seq}`, projectId: project.id, number: seq, onBehalfOfUserId: other.id, ...data } as any })
  return { me, other, agent, project, task }
}

describe('getMyRuns @SC-530', () => {
  it('groups a run going now, a queued task and a finished run, each with who started it', async () => {
    const { me, other, agent, task } = await cast()
    const going = await task({ runState: 'RUN_ACTIVE', runStartedBy: 'person', queuedByUserId: me.id, onBehalfOfUserId: me.id })
    const goingSession = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: going.id })
    siteStore.addRun(SITE, { id: 'r1', sessionId: goingSession.id, agentId: agent.id, status: 'RUNNING' })

    const waiting = await task({ runState: 'RUN_QUEUED', runStartedBy: 'pulse', assignedAgentId: agent.id, onBehalfOfUserId: me.id })

    const done = await task({ runState: 'RUN_NONE', runStartedBy: 'agent', queuedByAgentId: agent.id, onBehalfOfUserId: me.id })
    const doneSession = await createSession({ userId: other.id, agentId: agent.id, sessionType: 'task', taskId: done.id })
    siteStore.addRun(SITE, { id: 'r2', sessionId: doneSession.id, agentId: agent.id, status: 'COMPLETED' })

    const rows = await getMyRuns(undefined, ctx(me))
    const byTask = (id: string) => rows.find(r => r.task?.id === id)!

    expect(byTask(going.id)).toMatchObject({ group: 'running', startedByMe: true, onMyBehalf: true, startedBy: { kind: 'person' } })
    expect(byTask(waiting.id)).toMatchObject({ group: 'queued', startedBy: { kind: 'automation' }, sessionId: null })
    expect(byTask(waiting.id).wait).toMatchObject({ kind: 'line' })
    expect(byTask(done.id)).toMatchObject({ group: 'finished', state: 'done', startedByMe: false, onMyBehalf: true, startedBy: { kind: 'agent', name: agent.name } })
    // Who started it is named only when it was not the viewer.
    expect(byTask(going.id).startedByText).toBeNull()
    expect(byTask(waiting.id)).toMatchObject({ startedByText: 'started by automation' })
    expect(byTask(going.id).href).toBe(`/tasks/${byTask(going.id).ref}`)
  })

  it('leaves out runs that are neither the person’s doing nor done for them', async () => {
    const { me, other, agent, task } = await cast()
    const theirs = await task({ runState: 'RUN_ACTIVE', runStartedBy: 'person', queuedByUserId: other.id })
    const session = await createSession({ userId: other.id, agentId: agent.id, sessionType: 'task', taskId: theirs.id })
    siteStore.addRun(SITE, { id: 'r3', sessionId: session.id, agentId: agent.id, status: 'RUNNING' })
    await task({ runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: other.id })

    expect(await getMyRuns(undefined, ctx(me))).toEqual([])
  })

  it('shows a queued task once, not again for its earlier session', async () => {
    const { me, agent, task } = await cast()
    const again = await task({ runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: me.id, onBehalfOfUserId: me.id, assignedAgentId: agent.id })
    const session = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: again.id })
    siteStore.addRun(SITE, { id: 'r4', sessionId: session.id, agentId: agent.id, status: 'COMPLETED' })

    const rows = (await getMyRuns(undefined, ctx(me))).filter(r => r.task?.id === again.id)
    expect(rows.map(r => r.group)).toEqual(['queued'])
  })

  it('files a run stopped for the person under Waiting for you, saying what it waits for', async () => {
    const { me, agent, task } = await cast()
    const asking = await task({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval', onBehalfOfUserId: me.id })
    const askingSession = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: asking.id })
    siteStore.addRun(SITE, { id: 'r5', sessionId: askingSession.id, agentId: agent.id, status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' })
    const limited = await task({ runState: 'RUN_BLOCKED', runStateReason: 'reached its 30 min limit', onBehalfOfUserId: me.id })
    const limitedSession = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: limited.id })
    siteStore.addRun(SITE, { id: 'r6', sessionId: limitedSession.id, agentId: agent.id, status: 'CANCELLED' })

    const rows = await getMyRuns(undefined, ctx(me))
    expect(rows.find(r => r.task?.id === asking.id)).toMatchObject({ group: 'waiting', wantsApproval: true, state: 'wants approval' })
    expect(rows.find(r => r.task?.id === limited.id)).toMatchObject({ group: 'waiting', wantsApproval: false, state: 'reached its 30 min limit' })
  })

  it('a dismissed task whose request its site still holds pending is finished, not waiting @SC-643', async () => {
    const { me, agent, task } = await cast()
    const dismissed = await task({ runState: 'RUN_NONE', runStateReason: null, onBehalfOfUserId: me.id })
    const session = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: dismissed.id })
    siteStore.addRun(SITE, { id: 'r-dismissed', sessionId: session.id, agentId: agent.id, status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' })

    const rows = await getMyRuns(undefined, ctx(me))
    expect(rows.find(r => r.task?.id === dismissed.id)).toMatchObject({ group: 'finished', wantsApproval: false, state: 'done' })
  })

  it('names whose behalf a run is on when it is not theirs', async () => {
    const { me, other, agent, task } = await cast()
    const forAna = await task({ runState: 'RUN_ACTIVE', runStartedBy: 'pulse', onBehalfOfUserId: other.id, runOnBehalfOfUserId: null, queuedByUserId: me.id })
    const forAnaSession = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: forAna.id })
    siteStore.addRun(SITE, { id: 'r8', sessionId: forAnaSession.id, agentId: agent.id, status: 'RUNNING' })

    const rows = await getMyRuns(undefined, ctx(me))
    expect(rows.find(r => r.task?.id === forAna.id)!.startedByText).toMatch(/^started by automation · for /)
    expect(await getMyRunsGoingCount(undefined, ctx(me))).toBe(1)
  })

  it('lists no run of a chat from before @SC-1019', async () => {
    const { me, agent } = await cast()
    const chat = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'chat', title: 'An old chat' })
    siteStore.addRun(SITE, { id: 'r9', sessionId: chat.id, agentId: agent.id, status: 'RUNNING' })

    expect((await getMyRuns(undefined, ctx(me))).some(r => r.sessionId === chat.id)).toBe(false)
    expect(await getMyRunsGoingCount(undefined, ctx(me))).toBe(0)
  })

  it('reads each site once for the whole panel, not once per session', async () => {
    const { me, agent, task } = await cast()
    for (let i = 0; i < 4; i++) {
      const t = await task({ runState: 'RUN_ACTIVE', runStartedBy: 'person', queuedByUserId: me.id, onBehalfOfUserId: me.id })
      const s = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: t.id })
      siteStore.addRun(SITE, { id: `once-${seq}`, sessionId: s.id, agentId: agent.id, status: 'RUNNING' })
    }
    siteStore.listRuns.mockClear()
    siteStore.listRunsPage.mockClear()

    await getMyRuns(undefined, ctx(me))
    expect(siteStore.listRuns).not.toHaveBeenCalled()
    expect(siteStore.listRunsPage.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(getMyRuns(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})
