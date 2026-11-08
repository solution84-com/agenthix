/**
 * The Runs screen's reads (spec §6): the person's runs 25 at a time with one request per site, one run opened with its
 * tool calls' outputs, and who may see which.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createSession, createWorkerSession, createProject, ensureExecutionSite, createTestTask } from '../../test/factories'
import { ctx } from '../../sessions/__tests__/sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getRunsPage, getRunDetail, getToolCallOutput } from '../queries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
let seq = 0
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

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
    createTestTask({ data: { title: `Task ${++seq}`, projectId: project.id, number: seq, onBehalfOfUserId: me.id, ...data } as any })
  // A task's session of `userId`, the way each run in the list is found.
  const taskSession = async (userId: string, data: Record<string, unknown> = {}) =>
    createSession({ userId, agentId: agent.id, sessionType: 'task', taskId: (await task({ runState: 'RUN_NONE', ...data })).id })
  return { me, other, agent, project, task, taskSession }
}

describe('getRunsPage @SC-530 @SC-647 @SC-648', () => {
  it('lists every run of the person\'s tasks, newest first, and not another person\'s', async () => {
    const { me, other, agent, taskSession } = await cast()
    const pricing = await taskSession(me.id, { title: 'Pricing page' })
    const theirs = await taskSession(other.id, { title: 'Not mine', onBehalfOfUserId: other.id })
    const failing = await taskSession(me.id)
    siteStore.addRun(SITE, { id: 'old', sessionId: pricing.id, agentId: agent.id, taskId: pricing.taskId, startedAt: at(300), createdAt: at(300) })
    siteStore.addRun(SITE, { id: 'new', sessionId: pricing.id, agentId: agent.id, taskId: pricing.taskId, startedAt: at(10), createdAt: at(10) })
    siteStore.addRun(SITE, { id: 'task-run', sessionId: failing.id, agentId: agent.id, taskId: failing.taskId, startedAt: at(60), createdAt: at(60), status: 'FAILED', error: 'the build broke' })
    siteStore.addRun(SITE, { id: 'foreign', sessionId: theirs.id, agentId: agent.id, taskId: theirs.taskId, startedAt: at(5), createdAt: at(5) })

    const page = await getRunsPage({}, ctx(me))
    expect(page.runs.map(r => r.runId)).toEqual(['new', 'task-run', 'old'])
    expect(page.runs[1]).toMatchObject({ kind: 'task', outcome: 'failed — Something went wrong while the agent was working.' })
    expect(page.runs[1].href).toMatch(/^\/tasks\//)
    expect(page.nextCursor).toBeNull()
  })

  it('reads once per site for a whole page, never once per session', async () => {
    const { me, agent, taskSession } = await cast()
    for (let i = 0; i < 6; i++) {
      const s = await taskSession(me.id)
      siteStore.addRun(SITE, { id: `r-${seq}-${i}`, sessionId: s.id, agentId: agent.id, taskId: s.taskId, startedAt: at(i + 1), createdAt: at(i + 1) })
    }
    siteStore.listRuns.mockClear()
    siteStore.listRunsPage.mockClear()

    await getRunsPage({}, ctx(me))
    expect(siteStore.listRuns).not.toHaveBeenCalled()
    expect(siteStore.listRunsPage).toHaveBeenCalledTimes(1)
  })

  it('shows 25 and continues from the cursor, then stops', async () => {
    const { me, agent, taskSession } = await cast()
    const long = await taskSession(me.id, { title: 'Long one' })
    for (let i = 0; i < 30; i++) {
      siteStore.addRun(SITE, { id: `p${seq}-${String(i).padStart(2, '0')}`, sessionId: long.id, agentId: agent.id, taskId: long.taskId, startedAt: at(i + 1), createdAt: at(i + 1) })
    }
    const first = await getRunsPage({}, ctx(me))
    expect(first.runs).toHaveLength(25)
    expect(first.nextCursor).not.toBeNull()
    const second = await getRunsPage({ cursor: first.nextCursor! }, ctx(me))
    expect(second.runs).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.runs, ...second.runs].map(r => r.runId)).size).toBe(30)
  })

  it('narrows by how it ended, by place and by search', async () => {
    const { me, agent, project, taskSession } = await cast()
    const elsewhere = await createProject()
    await prisma.projectMember.create({ data: { projectId: elsewhere.id, userId: me.id } })
    const headline = await taskSession(me.id, { title: 'Headline ideas' })
    const roadmap = await taskSession(me.id, { title: 'Roadmap talk', projectId: elsewhere.id })
    siteStore.addRun(SITE, { id: 'ok', sessionId: headline.id, agentId: agent.id, taskId: headline.taskId, startedAt: at(20), createdAt: at(20), status: 'COMPLETED' })
    siteStore.addRun(SITE, { id: 'bad', sessionId: headline.id, agentId: agent.id, taskId: headline.taskId, startedAt: at(10), createdAt: at(10), status: 'FAILED' })
    siteStore.addRun(SITE, { id: 'proj', sessionId: roadmap.id, agentId: agent.id, taskId: roadmap.taskId, startedAt: at(5), createdAt: at(5) })

    expect((await getRunsPage({ ended: 'failed' }, ctx(me))).runs.map(r => r.runId)).toEqual(['bad'])
    expect((await getRunsPage({ place: project.key }, ctx(me))).runs.map(r => r.runId)).toEqual(['bad', 'ok'])
    expect((await getRunsPage({ place: elsewhere.key }, ctx(me))).runs.map(r => r.runId)).toEqual(['proj'])
    expect((await getRunsPage({ search: 'roadmap' }, ctx(me))).runs.map(r => r.runId)).toEqual(['proj'])
  })

  it('puts a queued task at the top of the first page only', async () => {
    const { me, agent, task } = await cast()
    const queued = await task({ runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: me.id, assignedAgentId: agent.id })
    const page = await getRunsPage({}, ctx(me))
    expect(page.runs[0]).toMatchObject({ runId: null, group: 'queued', title: queued.title })
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(getRunsPage({}, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getRunDetail and getToolCallOutput @SC-530 @SC-650 @SC-651 @SC-652 @SC-653', () => {
  async function aRun() {
    const { me, other, agent } = await cast()
    const chat = await createWorkerSession({ userId: me.id, agentId: agent.id, sessionType: 'chat', title: 'Footer', runtime: 'opencode' })
    siteStore.addRun(SITE, {
      id: `detail-${seq}`, sessionId: chat.id, agentId: agent.id, startedAt: at(10), endedAt: at(4), createdAt: at(10),
      model: 'claude-sonnet-5', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    })
    return { me, other, chat, runId: `detail-${seq}` }
  }

  it('shows the run to its owner, with its runtime, model, site and how it ended', async () => {
    const { me, chat, runId } = await aRun()
    const detail = await getRunDetail({ runId, sessionId: chat.id }, ctx(me))
    expect(detail).toMatchObject({ runId, kind: 'conversation', runtime: 'OpenCode', model: 'claude-sonnet-5', outcome: 'completed', startedByLine: 'by you' })
    expect(detail!.site).toBeTruthy()
  })

  it('answers the same for a run someone else may not see, one that does not exist, and one asked through another session', async () => {
    const { other, me, chat, runId } = await aRun()
    const mine = await createWorkerSession({ userId: me.id, agentId: (await createAgent()).id, sessionType: 'chat' })
    expect(await getRunDetail({ runId, sessionId: chat.id }, ctx(other))).toBeNull()
    expect(await getRunDetail({ runId: 'nope', sessionId: chat.id }, ctx(me))).toBeNull()
    expect(await getRunDetail({ runId, sessionId: mine.id }, ctx(me))).toBeNull()
  })

  it('finds a call\'s output by the call\'s own id, and says when it was not recorded', async () => {
    const { me, chat, runId } = await aRun()
    const call = (toolUseId: string | null, id: string) => ({
      id, runId, toolName: 'bash', toolInput: { command: 'ls' }, toolUseId, riskLevel: 'LOW' as const, blocked: false, blockReason: null, createdAt: at(8),
    })
    siteStore.addToolCalls(SITE, runId, [call('toolu_1', 'c1'), call(null, 'c2')])
    siteStore.addTranscript(SITE, chat.id, [
      { role: 'TOOL', toolName: 'bash', toolUseId: 'toolu_1', toolOutput: 'a.txt\nb.txt' },
      { role: 'TOOL', toolName: 'bash', toolUseId: 'toolu_other', toolOutput: 'someone else\'s' },
    ])

    expect(await getToolCallOutput({ runId, sessionId: chat.id, toolUseId: 'toolu_1' }, ctx(me)))
      .toEqual({ recorded: true, output: 'a.txt\nb.txt', truncated: false })
    // An id that is not one of this run's calls opens nothing, even when the session holds a line with it.
    expect(await getToolCallOutput({ runId, sessionId: chat.id, toolUseId: 'toolu_other' }, ctx(me))).toEqual({ recorded: false })
    expect(await getToolCallOutput({ runId, sessionId: chat.id, toolUseId: 'toolu_missing' }, ctx(me))).toEqual({ recorded: false })
  })

  it('names who approved a request, and which later run was given it', async () => {
    const { me, other, chat } = await aRun()
    const asked = siteStore.addRun(SITE, {
      id: `asked-${seq}`, sessionId: chat.id, startedAt: at(30), endedAt: at(29), createdAt: at(30), status: 'CANCELLED',
      manifestStatus: 'APPROVED', manifestDecidedAt: at(28), manifestDecidedById: other.id,
      pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [{ pattern: 'git push*' }] },
    })
    const given = siteStore.addRun(SITE, { id: `given-${seq}`, sessionId: chat.id, startedAt: at(20), endedAt: at(19), createdAt: at(20) })

    const askedDetail = await getRunDetail({ runId: asked.id, sessionId: chat.id }, ctx(me))
    expect(askedDetail!.request).toMatchObject({ status: 'APPROVED', decidedBy: expect.any(String) })
    expect(askedDetail!.request!.decidedBy).not.toBe('you')
    const givenDetail = await getRunDetail({ runId: given.id, sessionId: chat.id }, ctx(me))
    expect(givenDetail!.approvalGiven).toMatchObject({ tools: ['web_fetch'], bashPatterns: ['git push*'] })
    expect(givenDetail!.approvalGiven!.by).toBe(askedDetail!.request!.decidedBy)
  })

  it('opens no output to someone who may not see the run', async () => {
    const { other, chat, runId } = await aRun()
    expect(await getToolCallOutput({ runId, sessionId: chat.id, toolUseId: 'toolu_1' }, ctx(other))).toBeNull()
  })
})
