/**
 * The Runs history and a run's own page (spec D19, RU5, RN1): a project's every run for its members, the person's own
 * across projects, the tabs' counts and paging across the read, a reply named only for its owner, and a run found by
 * its id alone with the runs either side of it.
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

import { getRunHistory, getRunPage } from '../queries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
let seq = 0
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const dispatch = (startedBy: string, onBehalfOfUserId?: string) => ({ dispatch: { kind: 'task', startedBy, runLimits: { timeLimitMinutes: 60, turnLimit: 50 }, ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}) } })

beforeEach(async () => {
  await ensureExecutionSite({ siteId: SITE, protocolVersion: SITE_PROTOCOL_VERSION })
})

async function cast() {
  const me = await createUserWithRole('MEMBER')
  const kai = await createUserWithRole('MEMBER')
  const outsider = await createUserWithRole('MEMBER')
  const agent = await createAgent()
  const project = await createProject()
  await prisma.projectMember.createMany({ data: [me, kai].map(u => ({ projectId: project.id, userId: u.id })) })
  const task = (data: Record<string, unknown> = {}) =>
    createTestTask({ data: { title: `Task ${++seq}`, projectId: project.id, number: seq, onBehalfOfUserId: me.id, ...data } as any })
  const taskSession = async (data: Record<string, unknown> = {}) => {
    const t = await task(data)
    const s = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: t.id })
    return { task: t, session: s }
  }
  const reply = (userId: string, title: string) => createSession({
    userId, agentId: agent.id, sessionType: 'chat', title, primaryOwnerType: 'project', primaryOwnerId: project.id,
  })
  return { me, kai, outsider, agent, project, taskSession, reply }
}

describe('getRunHistory: a project’s Runs @RU5 @D19', () => {
  it('lists every run in the project, task runs and replies, newest first, with each one’s tab and who started it', async () => {
    const { me, kai, agent, project, taskSession, reply } = await cast()
    const a = await taskSession({ title: 'Fix the contact form', onBehalfOfUserId: kai.id })
    const b = await taskSession({ title: 'Find out why two pages load slowly', runState: 'RUN_FAILED', runStateReason: 'the build command failed', state: 'TODO' })
    const theirs = await reply(kai.id, 'Hosting options')
    siteStore.addRun(SITE, { id: 'run-a', sessionId: a.session.id, agentId: agent.id, taskId: a.task.id, status: 'RUNNING', startedAt: at(1), createdAt: at(1), metadata: dispatch('person', kai.id) })
    siteStore.addRun(SITE, { id: 'run-b', sessionId: b.session.id, agentId: agent.id, taskId: b.task.id, status: 'FAILED', error: 'the build command failed', startedAt: at(30), endedAt: at(26), createdAt: at(30), metadata: dispatch('person', me.id) })
    siteStore.addRun(SITE, { id: 'run-r', sessionId: theirs.id, agentId: agent.id, status: 'COMPLETED', startedAt: at(60), endedAt: at(59), createdAt: at(60) })
    await prisma.task.update({ where: { id: b.task.id }, data: { runId: 'run-b' } })

    const page = await getRunHistory({ projectKey: project.key }, ctx(me))
    expect(page.rows.map(r => r.runId)).toEqual(['run-a', 'run-b', 'run-r'])
    expect(page.rows[0]).toMatchObject({ kind: 'task', group: 'running', ring: 'RUNNING' })
    expect(page.rows[0].startedBy).not.toBe('you')
    expect(page.rows[1]).toMatchObject({ group: 'needs', ring: 'FAILED', startedBy: 'you', note: { lead: 'Failed', text: 'the build command failed' } })
    // Another person's reply is named for no one but them, and cannot be opened.
    expect(page.rows[2]).toMatchObject({ kind: 'reply', title: 'A reply in a conversation', href: null, openable: false })
    expect(page.counts).toEqual({ all: 3, running: 1, waiting: 0, needs: 1, finished: 1 })
    expect(page.needs).toEqual({ asks: 0, failed: 1, routines: 0 })

    const kais = await getRunHistory({ projectKey: project.key }, ctx(kai))
    expect(kais.rows.find(r => r.runId === 'run-r')).toMatchObject({ title: 'A reply in “Hosting options”', openable: true })
  })

  it('holds the tasks in line under Waiting, each with why it waits, as the Workroom counts them', async () => {
    const { me, agent, project, taskSession } = await cast()
    const busy = await taskSession({ title: 'Fix the contact form', assignedAgentId: agent.id, runState: 'RUN_ACTIVE', rank: 'a' })
    siteStore.addRun(SITE, { id: 'w-busy', sessionId: busy.session.id, agentId: agent.id, taskId: busy.task.id, status: 'RUNNING', startedAt: at(1), createdAt: at(1) })
    await prisma.task.update({ where: { id: busy.task.id }, data: { runId: 'w-busy' } })
    const next = await createTestTask({ data: { title: 'Draft the case-study page', projectId: project.id, number: ++seq, onBehalfOfUserId: me.id, assignedAgentId: agent.id, runState: 'RUN_QUEUED', rank: 'b', runStartedBy: 'person', queuedByUserId: me.id } as any })

    const waiting = await getRunHistory({ projectKey: project.key, state: 'waiting' }, ctx(me))
    expect(waiting.counts.waiting).toBe(1)
    expect(waiting.rows).toEqual([expect.objectContaining({
      taskId: next.id, group: 'waiting', ring: 'WAITING', number: 1, startedBy: 'you', why: { kind: 'next', after: 'Fix the contact form' },
    })])
    expect(waiting.taskChoices.map(t => t.title)).toContain('Draft the case-study page')
  })

  it('narrows to a tab, a kind and one task, and refuses someone who is not in the project', async () => {
    const { me, outsider, agent, project, taskSession, reply } = await cast()
    const a = await taskSession()
    const mine = await reply(me.id, 'Notes')
    siteStore.addRun(SITE, { id: 'n-a1', sessionId: a.session.id, agentId: agent.id, taskId: a.task.id, startedAt: at(5), createdAt: at(5) })
    siteStore.addRun(SITE, { id: 'n-a2', sessionId: a.session.id, agentId: agent.id, taskId: a.task.id, status: 'RUNNING', startedAt: at(2), createdAt: at(2) })
    siteStore.addRun(SITE, { id: 'n-r', sessionId: mine.id, agentId: agent.id, startedAt: at(3), createdAt: at(3) })

    expect((await getRunHistory({ projectKey: project.key, state: 'running' }, ctx(me))).rows.map(r => r.runId)).toEqual(['n-a2'])
    expect((await getRunHistory({ projectKey: project.key, kind: 'reply' }, ctx(me))).rows.map(r => r.runId)).toEqual(['n-r'])
    expect((await getRunHistory({ projectKey: project.key, taskKey: `${project.key}-${a.task.number}` }, ctx(me))).rows.map(r => r.runId)).toEqual(['n-a2', 'n-a1'])
    expect((await getRunHistory({ projectKey: project.key, kind: 'routine' }, ctx(me))).rows).toEqual([])
    await expect(getRunHistory({ projectKey: project.key }, ctx(outsider))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('counts and sorts across the whole read, and pages twenty at a time', async () => {
    const { me, agent, project, taskSession } = await cast()
    const a = await taskSession()
    for (let i = 0; i < 25; i++) {
      siteStore.addRun(SITE, {
        id: `p-${seq}-${String(i).padStart(2, '0')}`, sessionId: a.session.id, agentId: agent.id, taskId: a.task.id,
        startedAt: at(i + 10), endedAt: at(i + 10 - (i % 5) - 1), createdAt: at(i + 10),
      })
    }
    const first = await getRunHistory({ projectKey: project.key }, ctx(me))
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 20 })
    expect(first.rows).toHaveLength(20)
    const second = await getRunHistory({ projectKey: project.key, page: 2 }, ctx(me))
    expect(second.rows).toHaveLength(5)
    const longest = await getRunHistory({ projectKey: project.key, sort: 'took' }, ctx(me))
    expect(longest.rows[0].tookMs).toBeGreaterThanOrEqual(longest.rows[19].tookMs ?? 0)
  })
})

describe('getRunHistory: the organisation’s Runs @D19', () => {
  it('lists only the person’s own runs, each naming its project, and Whose narrows them', async () => {
    const { me, kai, agent, project, taskSession } = await cast()
    const mine = await taskSession({ title: 'Mine' })
    const forKai = await taskSession({ title: 'Kai’s', onBehalfOfUserId: kai.id })
    siteStore.addRun(SITE, { id: 'o-mine', sessionId: mine.session.id, agentId: agent.id, taskId: mine.task.id, startedAt: at(2), createdAt: at(2), metadata: dispatch('person', me.id) })
    siteStore.addRun(SITE, { id: 'o-kai', sessionId: forKai.session.id, agentId: agent.id, taskId: forKai.task.id, startedAt: at(3), createdAt: at(3), metadata: dispatch('person', kai.id) })

    const all = await getRunHistory({}, ctx(me))
    expect(all.rows.map(r => r.runId)).toEqual(['o-mine'])
    expect(all.rows[0].place).toEqual({ name: project.name, projectKey: project.key })
    expect((await getRunHistory({ whose: 'behalf' }, ctx(kai))).rows.map(r => r.runId)).toEqual(['o-kai'])
  })
})

describe('getRunPage: a run’s own page @RN1', () => {
  it('finds a task’s run by its id alone, with its number, limits, cost and the runs either side', async () => {
    const { me, agent, taskSession } = await cast()
    const a = await taskSession({ title: 'Check every footer link' })
    for (const [n, id, minutes] of [[1, 'f-1', 60], [2, 'f-2', 30], [3, 'f-3', 5]] as const) {
      siteStore.addRun(SITE, {
        id, sessionId: a.session.id, agentId: agent.id, taskId: a.task.id, startedAt: at(minutes), endedAt: at(minutes - 1), createdAt: at(minutes),
        metadata: dispatch('agent'), usage: { inputTokens: 15000, outputTokens: 3000, totalTokens: 18000 },
      })
      await prisma.runResult.create({ data: { runId: id, siteId: SITE, sessionId: a.session.id, taskId: a.task.id, number: n, stated: false } })
    }
    const view = await getRunPage({ runId: 'f-2' }, ctx(me))
    expect(view).toMatchObject({ kind: 'task', number: 2, limits: { timeLimitMinutes: 60, turnLimit: 50 }, tokens: 18000, startedBy: 'an agent' })
    expect(view?.previous).toMatchObject({ runId: 'f-1', number: 1 })
    expect(view?.next).toMatchObject({ runId: 'f-3', number: 3 })
  })

  it('answers null for a run the person may not see, the same as one that does not exist', async () => {
    const { outsider, agent, taskSession } = await cast()
    const a = await taskSession()
    siteStore.addRun(SITE, { id: 'hidden', sessionId: a.session.id, agentId: agent.id, taskId: a.task.id, createdAt: at(1) })
    expect(await getRunPage({ runId: 'hidden', sessionId: a.session.id }, ctx(outsider))).toBeNull()
    expect(await getRunPage({ runId: 'nothing' }, ctx(outsider))).toBeNull()
  })
})
