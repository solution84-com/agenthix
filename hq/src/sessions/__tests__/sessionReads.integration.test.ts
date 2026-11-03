/**
 * Reading a task session and its runs (spec §6.4, SC-397), against the real
 * test DB. A task session is its task's project's, not org-wide; a reader who
 * may not see it is answered exactly as if there were nothing there. A personal
 * project's task session is its person's alone, with or without its task.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createProject, createSession } from '../../test/factories'
import { ctx, seedSessionCast, makeTaskInProject } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { stopTaskSession, deleteTaskSession } from '../actions'
import { getSession, getTaskSession, getTaskRuns, getActivitySession, getTaskSessions } from '../queries'
import { canReachSessionContent } from '../sessionEntitlement'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

describe('getTaskSession — a task-scoped session read @SC-518', () => {
  it("serves a member of the task's project, with its transcript", async () => {
    const { member, task, taskSession } = await seedSessionCast()
    siteStore.addTranscript(SITE, taskSession.id, [{ role: 'USER', content: 'hello' }])
    const result = await getTaskSession({ taskId: task.id }, ctx(member))
    expect(result!.id).toBe(taskSession.id)
    expect(result!.entries.map((e: { content: string }) => e.content)).toEqual(['hello'])
  })

  // Reading never confirms a private thing exists (SC-397, R-110): this read's
  // answer for "nothing to show you" is null, so the outsider gets exactly that.
  it("answers a caller outside the task's project with null, without reaching the site", async () => {
    const { outsiderAdmin, task } = await seedSessionCast()
    await expect(getTaskSession({ taskId: task.id }, ctx(outsiderAdmin))).resolves.toBeNull()
    expect(siteStore.listTranscript).not.toHaveBeenCalled()
  })

  it('answers null, as for a hidden one, for a task with no session yet and for no such task', async () => {
    const { outsiderAdmin, member, project } = await seedSessionCast()
    const fresh = await makeTaskInProject(project.id)
    await expect(getTaskSession({ taskId: fresh.id }, ctx(member))).resolves.toBeNull()
    await expect(getTaskSession({ taskId: 'no-such-task' }, ctx(outsiderAdmin))).resolves.toBeNull()
  })
})

// Names on messages (every-screen-reviewed spec §3, §9): every viewer sees who sent each message; their own read as "You".
describe("a task session's messages name who sent them @SC-519", () => {
  it("names another person's message, and leaves the viewer's own and an unsigned one unnamed", async () => {
    const { member, task, taskSession, project } = await seedSessionCast()
    const colleague = await prisma.user.create({
      data: { auth: { create: { identities: { create: { providerName: 'username', providerUserId: `ana${Date.now()}`, providerData: '{}' } } } } },
      include: { auth: { include: { identities: true } } },
    })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: colleague.id } })
    siteStore.addTranscript(SITE, taskSession.id, [
      { role: 'USER', content: 'from ana', authorId: colleague.id },
      { role: 'USER', content: 'from me', authorId: member.id },
      { role: 'ASSISTANT', content: 'reply' },
      { role: 'USER', content: 'from someone gone', authorId: 'removed-person' },
    ])

    const forMember = await getTaskSession({ taskId: task.id }, ctx(member))
    expect(forMember!.entries.map((e: { authorName: string | null }) => e.authorName))
      .toEqual([colleague.auth!.identities[0].providerUserId, null, null, 'Former member'])

    const asSeenByAna = await getActivitySession({ sessionId: taskSession.id }, ctx(colleague))
    expect(asSeenByAna.entries.map((e: { authorName: string | null }) => e.authorName))
      .toEqual([null, member.id.slice(0, 8), null, 'Former member'])
  })
})

describe('getTaskRuns — a task-scoped run history read', () => {
  it("serves a member of the task's project, each run with its agent", async () => {
    const { member, task, agent } = await seedSessionCast()
    siteStore.addRun(SITE, { id: 'run-1', taskId: task.id, agentId: agent.id })
    const result = await getTaskRuns({ taskId: task.id }, ctx(member))
    expect(result).toEqual([expect.objectContaining({ id: 'run-1', agent: expect.objectContaining({ id: agent.id }) })])
  })

  it("answers a caller outside the task's project as not found, without reaching the site", async () => {
    const { outsiderAdmin, task } = await seedSessionCast()
    await expect(getTaskRuns({ taskId: task.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404, message: 'Task not found' })
    expect(siteStore.listRuns).not.toHaveBeenCalled()
  })

  it('answers a private task and a missing one identically', async () => {
    const { outsiderAdmin, task } = await seedSessionCast()
    const hidden = await getTaskRuns({ taskId: task.id }, ctx(outsiderAdmin)).catch((e: Error) => e)
    const missing = await getTaskRuns({ taskId: 'no-such-task' }, ctx(outsiderAdmin)).catch((e: Error) => e)
    expect(hidden).toMatchObject({ statusCode: 404 })
    expect(missing).toMatchObject({ statusCode: 404 })
    expect((hidden as Error).message).toBe((missing as Error).message)
  })
})

describe('getActivitySession @SC-155 @SC-156', () => {
  it('returns the activity session with agent, transcript, and latest run (@SC-155)', async () => {
    const user = await createUser()
    const agent = await createAgent({ name: 'Scout' })
    const session = await createSession({ userId: user.id, agentId: agent.id, title: 'Activity one' })
    siteStore.addTranscript(SITE, session.id, [{ role: 'USER', content: 'hi' }])
    siteStore.addRun(SITE, { id: 'run-older', sessionId: session.id, status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z' })
    siteStore.addRun(SITE, { id: 'run-latest', sessionId: session.id, status: 'RUNNING', createdAt: '2026-01-02T00:00:00.000Z' })

    const result = await getActivitySession({ sessionId: session.id }, ctx(user))

    expect(result).toMatchObject({ id: session.id, agent: { id: agent.id, name: 'Scout' } })
    expect(result.entries.map((e: { content: string }) => e.content)).toEqual(['hi'])
    // Latest run only.
    expect(result.AgentRun).toEqual([{ id: 'run-latest', status: 'RUNNING', manifestStatus: null }])
  })

  // Chat sessions are owner-only for every role, ADMIN included (ADR-0041, SC-278).
  it('rejects a non-owner viewing a chat session (404) (@SC-278)', async () => {
    const { outsiderAdmin, chat } = await seedSessionCast()
    await expect(getActivitySession({ sessionId: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an unauthenticated caller with 401, and an unknown session id with 404 (@SC-156)', async () => {
    const { member, chat } = await seedSessionCast()
    await expect(getActivitySession({ sessionId: chat.id }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    await expect(getActivitySession({ sessionId: 'does-not-exist' }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getActivitySession — a task session is not org-wide', () => {
  it("serves a member of the task's project, though the row names someone else", async () => {
    const { member, taskSession } = await seedSessionCast()
    expect((await getActivitySession({ sessionId: taskSession.id }, ctx(member))).id).toBe(taskSession.id)
  })

  it('answers a private task session, a chat that is not yours and a missing session identically (SC-397)', async () => {
    const { outsiderAdmin, taskSession, chat } = await seedSessionCast()
    const privateTask = await getActivitySession({ sessionId: taskSession.id }, ctx(outsiderAdmin)).catch((e: Error) => e)
    const otherChat = await getActivitySession({ sessionId: chat.id }, ctx(outsiderAdmin)).catch((e: Error) => e)
    const missing = await getActivitySession({ sessionId: 'nope' }, ctx(outsiderAdmin)).catch((e: Error) => e)

    for (const answer of [privateTask, otherChat, missing]) expect(answer).toMatchObject({ statusCode: 404 })
    expect((privateTask as Error).message).toBe((missing as Error).message)
    expect((otherChat as Error).message).toBe((missing as Error).message)
    expect(siteStore.listTranscript).not.toHaveBeenCalled()
  })

  // A task's session is deleted with its task; one left without a task has no
  // project to answer for it, so nobody reads it — not the routing admin it names.
  it('answers a task session without a task as not found, to everyone', async () => {
    const { member, routingAdmin, outsiderAdmin, orphaned, orphanedInProject } = await seedSessionCast()
    for (const session of [orphaned, orphanedInProject]) {
      for (const reader of [member, routingAdmin, outsiderAdmin]) {
        await expect(getActivitySession({ sessionId: session.id }, ctx(reader))).rejects.toMatchObject({ statusCode: 404 })
      }
    }
    expect(siteStore.listTranscript).not.toHaveBeenCalled()
  })
})

// getSession reads a session by the same rule as getActivitySession — never by
// the `userId` on the row, which for a task session names a routing admin.
describe('getSession — one reading rule', () => {
  it("serves a task session to its project's members and refuses the routing admin outside the project", async () => {
    const { member, routingAdmin, taskSession } = await seedSessionCast()
    await expect(getSession({ id: taskSession.id }, ctx(member))).resolves.toMatchObject({ id: taskSession.id })
    await expect(getSession({ id: taskSession.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('serves a chat to its person alone, and a task session without a task to nobody, before any site call', async () => {
    const { member, outsiderAdmin, routingAdmin, chat, orphaned } = await seedSessionCast()
    await expect(getSession({ id: chat.id }, ctx(member))).resolves.toMatchObject({ id: chat.id })
    await expect(getSession({ id: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getSession({ id: orphaned.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(siteStore.listTranscript).toHaveBeenCalledTimes(1)
  })
})

// A task session in the listing is scoped to the caller's project entitlement,
// through the task relation — not shown to everyone.
describe('getTaskSessions — task sessions are filtered to entitled projects', () => {
  const ids = (sessions: Array<{ id: string }>) => sessions.map((s) => s.id)

  it("lists a task session for a member of the task's project, and not for someone outside it", async () => {
    const { member, outsiderAdmin, taskSession } = await seedSessionCast()
    expect(ids(await getTaskSessions(undefined, ctx(member)))).toContain(taskSession.id)
    expect(ids(await getTaskSessions(undefined, ctx(outsiderAdmin)))).not.toContain(taskSession.id)
  })

  it('lists a task session only to members when its project is OPEN (adr-0099)', async () => {
    const { member, outsiderAdmin, taskSession, project } = await seedSessionCast()
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'OPEN' } })
    expect(ids(await getTaskSessions(undefined, ctx(outsiderAdmin)))).not.toContain(taskSession.id)
    expect(ids(await getTaskSessions(undefined, ctx(member)))).toContain(taskSession.id)
  })

  it('refuses a caller who is not signed in, without probing the site', async () => {
    await seedSessionCast()
    await expect(getTaskSessions(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(siteStore.listRuns).not.toHaveBeenCalled()
  })
})

// ── A personal project's task session (agents own schedule spec §4) ────────
// It works in its person's own storage and is theirs alone — with its task, and
// after its task is deleted. An org admin is refused like anyone else.
describe("a personal project's task session is its person's alone", () => {
  async function seedPersonal() {
    const owner = await createUserWithRole('MEMBER')
    const orgAdmin = await createUserWithRole('ADMIN')
    const agent = await createAgent()
    const project = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: owner.id, personalSpace: true })
    // The org admin even holds a member row; it grants nothing on a personal project.
    await prisma.projectMember.create({ data: { projectId: project.id, userId: orgAdmin.id, role: 'ADMIN' } })
    const task = await makeTaskInProject(project.id)
    const personal = { sessionType: 'task', primaryOwnerType: 'user', primaryOwnerId: owner.id }
    const withTask = await createSession({ userId: owner.id, agentId: agent.id, taskId: task.id, ...personal })
    const orphaned = await createSession({ userId: owner.id, agentId: agent.id, ...personal })
    return { owner, orgAdmin, withTask, orphaned }
  }

  it('canReachSessionContent answers for its person only, task or none', async () => {
    const { owner, orgAdmin, withTask, orphaned } = await seedPersonal()
    expect(await canReachSessionContent(orphaned, owner.id)).toBe(true)
    expect(await canReachSessionContent(orphaned, orgAdmin.id)).toBe(false)
    expect(await canReachSessionContent(withTask, owner.id)).toBe(true)
    expect(await canReachSessionContent(withTask, orgAdmin.id)).toBe(false)
  })

  it('getActivitySession serves its person and answers anyone else as not found, its task deleted or not', async () => {
    const { owner, orgAdmin, withTask, orphaned } = await seedPersonal()
    await expect(getActivitySession({ sessionId: orphaned.id }, ctx(owner))).resolves.toMatchObject({ id: orphaned.id })
    await expect(getActivitySession({ sessionId: orphaned.id }, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getActivitySession({ sessionId: withTask.id }, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an org admin may not stop or delete it once its task is gone; its person may', async () => {
    const { owner, orgAdmin, orphaned } = await seedPersonal()
    siteStore.addSession(SITE, { id: orphaned.id })
    siteStore.addRun(SITE, { id: 'run-1', sessionId: orphaned.id, status: 'RUNNING' })

    await expect(stopTaskSession({ sessionId: orphaned.id }, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteTaskSession({ sessionId: orphaned.id }, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect((await siteStore.getRun(SITE, 'run-1'))?.status).toBe('RUNNING')
    expect(await prisma.agentSession.findUnique({ where: { id: orphaned.id } })).not.toBeNull()

    await expect(stopTaskSession({ sessionId: orphaned.id }, ctx(owner))).resolves.toEqual({ cancelled: 1 })
  })
})
