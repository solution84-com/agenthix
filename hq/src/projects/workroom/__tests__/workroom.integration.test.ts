/**
 * The Workroom and Workrooms against the real database (spec D17–D19, RU1–RU4): each agent's scorecard from hq's tasks
 * and the site's runs, Workrooms narrowed to the viewer's own runs, the agents' order kept for the project, and Stop on
 * Workrooms stopping only the viewer's own runs where they may work. Only the site is stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { addTask, agentInProject } from '../../../agents/__tests__/taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))

import { readWorkrooms } from '../workroomRead'
import { stopMyRuns as stopMine } from '../stopMyRuns'
import { reorderWorkroomAgents } from '../workroomOperations'
import { MANIFEST_BLOCKED_REASON } from '../../../agents/taskExecutionReasons'
import { createAgent, createUser, ensureExecutionSite, joinProjectAs } from '../../../test/factories'
import * as siteFake from '../../../test/fakes/siteRuntimeStore'

const NOW = new Date()
const FROM = new Date(NOW.getTime() - 60 * 60_000)
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()

async function inProject(w: Awaited<ReturnType<typeof agentInProject>>, agentId = w.agent.id, position?: number) {
  await prisma.projectAgent.create({ data: { projectId: w.project.id, agentId, ...(position === undefined ? {} : { position }) } })
}

async function taskSession(w: { agent: { id: string }; person: { id: string } }, taskId: string, id: string) {
  await prisma.agentSession.create({ data: { id, agentId: w.agent.id, userId: w.person.id, sessionType: 'task', taskId } as never })
}

beforeEach(async () => { await ensureExecutionSite({ siteId: 'site-1' }) })

describe("a project's Workroom", () => {
  it('draws each agent at work, in line with why, what needs a person, and what ran today and cost', async () => {
    const w = await agentInProject()
    await inProject(w)
    const running = await addTask(w, { title: 'Fix the contact form', runState: 'RUN_ACTIVE', runId: 'run-a', rank: 'a', runStartedBy: 'person', queuedByUserId: w.person.id })
    const next = await addTask(w, { title: 'Draft the case-study page', rank: 'b', runStartedBy: 'person' })
    await addTask(w, { title: 'Write the home page copy', runState: 'RUN_BLOCKED', runStateReason: `${MANIFEST_BLOCKED_REASON}: npm run build`, state: 'IN_PROGRESS' })
    await addTask(w, { title: 'Find out why two pages load slowly', runState: 'RUN_FAILED', runStateReason: 'the build failed', state: 'IN_PROGRESS' })
    await addTask(w, { title: 'Ready one', runState: 'RUN_NONE', state: 'TODO', executionState: 'NOT_STARTED' })
    await taskSession(w, running.id, 'sess-a')
    siteFake.addRun('site-1', { id: 'run-a', agentId: w.agent.id, sessionId: 'sess-a', taskId: running.id, status: 'RUNNING', startedAt: ago(1), createdAt: ago(1), model: 'claude-sonnet-4-5' })
    siteFake.addRun('site-1', {
      id: 'run-old', agentId: w.agent.id, sessionId: 'sess-a', taskId: running.id, status: 'COMPLETED', createdAt: ago(20), endedAt: ago(9),
      usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }, model: 'claude-sonnet-4-5',
    })

    const [room] = await readWorkrooms([w.project.id], w.person.id, { mine: false, from: FROM, now: NOW })
    const card = room.agents[0]
    expect(card.ring).toBe('RUNNING')
    expect(card.now.map(r => r.title)).toEqual(['Fix the contact form'])
    expect(card.now[0].startedBy).toBe('you')
    expect(card.line).toEqual([expect.objectContaining({ taskId: next.id, why: { kind: 'next', after: 'Fix the contact form' } })])
    expect(card.needs.map(n => n.reason).sort()).toEqual(['approval', 'failed'])
    expect(card.ready).toBe(1)
    expect(card.runsToday).toBe(2)
    expect(card.finishedToday).toBe(1)
    expect(card.lastFinished?.title).toBe('Fix the contact form')
    expect(room.counts).toMatchObject({ needsYou: 2, running: 1, waiting: 1, finishedToday: 1 })
    expect(room.nothingYet).toBe(false)
  })

  it("names a reply by its conversation's title only for the person whose conversation it is", async () => {
    const w = await agentInProject()
    await inProject(w)
    const other = await createUser()
    await prisma.agentSession.create({ data: { id: 'sess-r', agentId: w.agent.id, userId: other.id, sessionType: 'chat', title: 'Private plans', primaryOwnerType: 'project', primaryOwnerId: w.project.id } as never })
    siteFake.addRun('site-1', { id: 'run-r', agentId: w.agent.id, sessionId: 'sess-r', status: 'RUNNING', createdAt: ago(1), startedAt: ago(1) })

    const [mine] = await readWorkrooms([w.project.id], other.id, { mine: false, from: FROM, now: NOW })
    const [theirs] = await readWorkrooms([w.project.id], w.person.id, { mine: false, from: FROM, now: NOW })
    expect(mine.agents[0].now[0]).toMatchObject({ kind: 'reply', title: 'Private plans' })
    expect(theirs.agents[0].now[0]).toMatchObject({ kind: 'reply', title: null, href: null })
  })

  it('says nothing has run yet in a project where no task was ever run', async () => {
    const w = await agentInProject()
    await inProject(w)
    const [room] = await readWorkrooms([w.project.id], w.person.id, { mine: false, from: FROM, now: NOW })
    expect(room.nothingYet).toBe(true)
  })

  it('keeps its agents in the order they were dragged to, and refuses an order that names other agents', async () => {
    const w = await agentInProject()
    const second = await createAgent()
    await inProject(w)
    await inProject(w, second.id)
    await joinProjectAs(w.project.id, w.person.id, 'MEMBER')
    const context = { user: { id: w.person.id } } as never

    await reorderWorkroomAgents({ projectId: w.project.id, agentIds: [second.id, w.agent.id] }, context)
    const [room] = await readWorkrooms([w.project.id], w.person.id, { mine: false, from: FROM, now: NOW })
    expect(room.agents.map(a => a.agentId)).toEqual([second.id, w.agent.id])
    await expect(reorderWorkroomAgents({ projectId: w.project.id, agentIds: [second.id] }, context)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('Workrooms', () => {
  it("shows only the viewer's own runs: started by them or on their behalf", async () => {
    const w = await agentInProject()
    await inProject(w)
    const someone = await createUser()
    await addTask(w, { title: 'Mine', rank: 'a', runStartedBy: 'person', queuedByUserId: w.person.id })
    await addTask({ ...w, person: someone }, { title: 'Theirs', rank: 'b', runStartedBy: 'person', queuedByUserId: someone.id })

    const [room] = await readWorkrooms([w.project.id], w.person.id, { mine: true, from: FROM, now: NOW })
    expect(room.agents[0].line.map(t => t.title)).toEqual(['Mine'])
  })

  it("stops only the viewer's own runs, and none in a project where they only read", async () => {
    const w = await agentInProject()
    await inProject(w)
    await joinProjectAs(w.project.id, w.person.id, 'MEMBER')
    const someone = await createUser()
    const mine = await addTask(w, { runStartedBy: 'person', queuedByUserId: w.person.id })
    const theirs = await addTask({ ...w, person: someone }, { runStartedBy: 'person', queuedByUserId: someone.id })

    const read = await agentInProject()
    await joinProjectAs(read.project.id, w.person.id, 'VIEWER')
    const unread = await addTask({ ...read, person: w.person }, { runStartedBy: 'person', queuedByUserId: w.person.id })

    const result = await stopMine(w.person.id, 'Sam', {})
    expect(result).toMatchObject({ withdrawn: 1, projects: 1 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: mine.id } })).runState).toBe('RUN_NONE')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).runState).toBe('RUN_QUEUED')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: unread.id } })).runState).toBe('RUN_QUEUED')
  })
})
