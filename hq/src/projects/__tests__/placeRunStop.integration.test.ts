/**
 * Stop all for one place (every screen reviewed spec §3, §9), against the real
 * test database with the shared fake site: a project's queued tasks are
 * withdrawn and its running ones stopped, with the caller's own conversations
 * there; other people's conversations and other places are left alone. Allowed
 * to the project's admins, and to a person in their own space.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createUserWithRole, ensureExecutionSite } from '../../test/factories'
import { makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn(), emitTasksToHq: vi.fn() }))

import { stopPlaceRuns } from '../placeRunStop'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

let SITE: string
const as = (user: { id: string } | null) => ({ user: user ?? undefined }) as any
const runStateOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).runState
const cancelled = () => siteStore.cancelledRuns.map((c) => c.runId).sort()

beforeEach(async () => {
  SITE = (await ensureExecutionSite()).siteId
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

/** A project with an admin, a member, a running task, a queued one, and a chat of each person working in it. */
async function busyProject() {
  const admin = await createUserWithRole('MEMBER')
  const member = await createUserWithRole('MEMBER')
  const project = await createProject()
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: admin.id, role: 'ADMIN' },
      { projectId: project.id, userId: member.id, role: 'MEMBER' },
    ],
  })
  const agent = await createAgent()
  const running = await makeTask(project.id, { runState: 'RUN_ACTIVE', runId: 'r-task', assignedAgentId: agent.id })
  const queued = await makeTask(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id })
  const held = await makeTask(project.id, { runState: 'RUN_QUEUED', runStateReason: 'held — site unreachable', assignedAgentId: agent.id })
  const blocked = await makeTask(project.id, { runState: 'RUN_BLOCKED', runStateReason: 'needs a person' })
  const taskSession = await createSession({ userId: admin.id, agentId: agent.id, sessionType: 'task', taskId: running.id })
  const myChat = await createSession({ userId: admin.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
  const theirChat = await createSession({ userId: member.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
  siteStore.addRun(SITE, { id: 'r-task', sessionId: taskSession.id, status: 'RUNNING' })
  siteStore.addRun(SITE, { id: 'r-mine', sessionId: myChat.id, status: 'PENDING' })
  siteStore.addRun(SITE, { id: 'r-theirs', sessionId: theirChat.id, status: 'RUNNING' })
  return { admin, member, project, running, queued, held, blocked }
}

describe('stopPlaceRuns in a project @SC-503', () => {
  it("withdraws its queued tasks, stops its running ones and the caller's own conversations there", async () => {
    const c = await busyProject()
    const elsewhere = await createProject()
    const other = await makeTask(elsewhere.id, { runState: 'RUN_QUEUED' })

    const result = await stopPlaceRuns({ projectId: c.project.id }, as(c.admin))

    expect(result).toEqual({ withdrawn: 3, cancelled: 2 })
    expect(cancelled()).toEqual(['r-mine', 'r-task'])
    for (const t of [c.running, c.queued, c.held]) expect(await runStateOf(t.id)).toBe('RUN_NONE')
    expect(await runStateOf(c.blocked.id)).toBe('RUN_BLOCKED')
    expect(await runStateOf(other.id)).toBe('RUN_QUEUED')
  })

  it('takes waiting tasks out of line, back to Not started, its Run at… times included: nothing more starts (N4)', async () => {
    const c = await busyProject()
    const later = new Date(Date.now() + 6 * 3_600_000)
    const timed = await makeTask(c.project.id, { runState: 'RUN_NONE', scheduleAt: later, scheduleNextDueAt: later })
    await stopPlaceRuns({ projectId: c.project.id }, as(c.admin))
    expect(await prisma.task.findUniqueOrThrow({ where: { id: timed.id } })).toMatchObject({ scheduleAt: null, scheduleNextDueAt: null })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: c.queued.id } })).toMatchObject({ runState: 'RUN_NONE', executionState: 'NOT_STARTED' })
  })

  it("leaves another person's conversation running: it is theirs to stop", async () => {
    const c = await busyProject()
    await stopPlaceRuns({ projectId: c.project.id }, as(c.admin))
    expect((await siteStore.getRun(SITE, 'r-theirs'))?.status).toBe('RUNNING')
  })

  it('refuses a member who is not a project admin, and changes nothing', async () => {
    const c = await busyProject()
    await expect(stopPlaceRuns({ projectId: c.project.id }, as(c.member))).rejects.toMatchObject({ statusCode: 403 })
    expect(await runStateOf(c.queued.id)).toBe('RUN_QUEUED')
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it("refuses the project's Viewer, who never stops work, even as the organisation's admin (adr-0102)", async () => {
    const viewer = await createUserWithRole('ADMIN')
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'VIEWER' } })
    await expect(stopPlaceRuns({ projectId: project.id }, as(viewer))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a caller who is not signed in', async () => {
    const c = await busyProject()
    await expect(stopPlaceRuns({ projectId: c.project.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('puts a running task back when its site cannot be reached, so it is not shown as stopped while it runs', async () => {
    const c = await busyProject()
    siteStore.makeSiteUnreachable(SITE)

    await expect(stopPlaceRuns({ projectId: c.project.id }, as(c.admin))).rejects.toMatchObject({ statusCode: 503 })

    expect(await runStateOf(c.running.id)).toBe('RUN_ACTIVE')
    expect(await runStateOf(c.queued.id)).toBe('RUN_NONE')
  })
})

describe('stopPlaceRuns in a personal space @SC-503', () => {
  it("stops the person's own tasks and their conversations outside any project", async () => {
    const me = await createUserWithRole('MEMBER')
    const personal = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: me.id, personalSpace: true, executionSiteId: null })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: me.id, role: 'ADMIN' } })
    const agent = await createAgent()
    const queued = await makeTask(personal.id, { runState: 'RUN_QUEUED', onBehalfOfUserId: me.id })
    const chat = await createSession({ userId: me.id, agentId: agent.id })
    const project = await createProject()
    const projectChat = await createSession({ userId: me.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    siteStore.addRun(SITE, { id: 'r-chat', sessionId: chat.id, status: 'RUNNING' })
    siteStore.addRun(SITE, { id: 'r-project', sessionId: projectChat.id, status: 'RUNNING' })

    const result = await stopPlaceRuns({ projectId: personal.id }, as(me))

    expect(result).toEqual({ withdrawn: 1, cancelled: 1 })
    expect(cancelled()).toEqual(['r-chat'])
    expect(await runStateOf(queued.id)).toBe('RUN_NONE')
  })

  it("refuses anyone else's personal space as if it did not exist", async () => {
    const owner = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const personal = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: owner.id })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: owner.id, role: 'ADMIN' } })
    await expect(stopPlaceRuns({ projectId: personal.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})
