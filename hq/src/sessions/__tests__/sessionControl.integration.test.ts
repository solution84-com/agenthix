/**
 * Who may stop, delete, rename and archive a session (spec §6.4), against the
 * real test DB. A task session's `userId` is a routing identity — TaskRunner's
 * arbitrary-administrator fallback — never an owner: a task session belongs to
 * its task's project, a chat to its person, and a task session whose task was
 * deleted to the org admin (R-196). The site is the shared fake, so what the
 * site holds after each call is checked there.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { ctx, seedSessionCast, makeProjectViewer } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { stopTaskSession, deleteTaskSession, updateSession, archiveSession, cancelAgentRun } from '../actions'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

/** The session as the site holds it, with one running run. */
function onSite(session: { id: string; title?: string | null }) {
  siteStore.addSession(SITE, { id: session.id, title: session.title ?? null })
  siteStore.addRun(SITE, { id: `run-${session.id}`, sessionId: session.id, status: 'RUNNING' })
}

async function runStatus(sessionId: string) {
  return (await siteStore.getRun(SITE, `run-${sessionId}`))?.status
}

describe('who may stop a session', () => {
  it("a member of the task's project may stop its session", async () => {
    const { member, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(stopTaskSession({ sessionId: taskSession.id }, ctx(member))).resolves.toEqual({ cancelled: 1 })
    expect(await runStatus(taskSession.id)).toBe('CANCELLED')
  })

  it('answers 503, not 500, when the session\'s site cannot be reached, to stop it or to cancel one run', async () => {
    const { member, taskSession } = await seedSessionCast()
    onSite(taskSession)
    siteStore.makeSiteUnreachable(SITE)
    await expect(stopTaskSession({ sessionId: taskSession.id }, ctx(member))).rejects.toMatchObject({ statusCode: 503 })
    await expect(cancelAgentRun({ runId: `run-${taskSession.id}`, sessionId: taskSession.id }, ctx(member))).rejects.toMatchObject({ statusCode: 503 })
  })

  it('an outsider may not, even as an org admin, and the site is never reached', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(stopTaskSession({ sessionId: taskSession.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(siteStore.listRuns).not.toHaveBeenCalled()
    expect(await runStatus(taskSession.id)).toBe('RUNNING')
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(stopTaskSession({ sessionId: taskSession.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await runStatus(taskSession.id)).toBe('RUNNING')
  })

  it('a person may stop their own chat session, and another person may not', async () => {
    const { member, outsiderAdmin, chat } = await seedSessionCast()
    onSite(chat)
    await expect(stopTaskSession({ sessionId: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await runStatus(chat.id)).toBe('RUNNING')
    await expect(stopTaskSession({ sessionId: chat.id }, ctx(member))).resolves.toEqual({ cancelled: 1 })
  })

  it('a task session whose task was deleted may be stopped by an org admin, whoever the row names', async () => {
    const { outsiderAdmin, routingAdmin, orphaned } = await seedSessionCast()
    onSite(orphaned)
    await expect(stopTaskSession({ sessionId: orphaned.id }, ctx(outsiderAdmin))).resolves.toEqual({ cancelled: 1 })
    siteStore.addRun(SITE, { id: 'run-second', sessionId: orphaned.id, status: 'RUNNING' })
    await expect(stopTaskSession({ sessionId: orphaned.id }, ctx(routingAdmin))).resolves.toEqual({ cancelled: 1 })
  })

  it('a task session whose task was deleted may not be stopped by a Member (403 naming ADMIN), and nothing is cancelled', async () => {
    const { member, orphaned } = await seedSessionCast()
    onSite(orphaned)
    await expect(stopTaskSession({ sessionId: orphaned.id }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect(await runStatus(orphaned.id)).toBe('RUNNING')
  })

  it("a project's task session whose task was deleted is stopped by the project's admins, not a Member or an org admin outside it", async () => {
    const { member, outsiderAdmin, project, orphanedInProject } = await seedSessionCast()
    onSite(orphanedInProject)
    for (const refused of [member, outsiderAdmin]) {
      await expect(stopTaskSession({ sessionId: orphanedInProject.id }, ctx(refused)))
        .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('admin of this project') })
    }
    expect(await runStatus(orphanedInProject.id)).toBe('RUNNING')
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.id } }, data: { role: 'ADMIN' } })
    await expect(stopTaskSession({ sessionId: orphanedInProject.id }, ctx(member))).resolves.toEqual({ cancelled: 1 })
  })

  it("the project's Viewer may not stop a task session (403 saying so), and nothing is cancelled", async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectViewer(project.id, member.id)
    onSite(taskSession)
    await expect(stopTaskSession({ sessionId: taskSession.id }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(await runStatus(taskSession.id)).toBe('RUNNING')
  })
})

describe('who may delete a session', () => {
  async function stillThere(sessionId: string) {
    expect(await prisma.agentSession.findUnique({ where: { id: sessionId } })).not.toBeNull()
    expect(await siteStore.getSession(SITE, sessionId)).not.toBeNull()
  }
  async function gone(sessionId: string) {
    expect(await prisma.agentSession.findUnique({ where: { id: sessionId } })).toBeNull()
    expect(await siteStore.getSession(SITE, sessionId)).toBeNull()
  }

  it("a member of the task's project may delete its session, on the site and in hq", async () => {
    const { member, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await deleteTaskSession({ sessionId: taskSession.id }, ctx(member))
    await gone(taskSession.id)
  })

  it('an outsider may not delete it — nothing is cancelled or deleted on the refusal path', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(deleteTaskSession({ sessionId: taskSession.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await runStatus(taskSession.id)).toBe('RUNNING')
    await stillThere(taskSession.id)
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(deleteTaskSession({ sessionId: taskSession.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await stillThere(taskSession.id)
  })

  it('a person may delete their own chat session', async () => {
    const { member, chat } = await seedSessionCast()
    onSite(chat)
    await deleteTaskSession({ sessionId: chat.id }, ctx(member))
    await gone(chat.id)
  })

  it('a task session whose task was deleted may be deleted by an org admin, whoever the row names', async () => {
    const { outsiderAdmin, routingAdmin, orphaned, agent } = await seedSessionCast()
    onSite(orphaned)
    await deleteTaskSession({ sessionId: orphaned.id }, ctx(outsiderAdmin))
    await gone(orphaned.id)

    const another = await prisma.agentSession.create({ data: { userId: routingAdmin.id, agentId: agent.id, sessionType: 'task' } })
    onSite(another)
    await deleteTaskSession({ sessionId: another.id }, ctx(routingAdmin))
    await gone(another.id)
  })

  it('a task session whose task was deleted may not be deleted by a Member (403 naming ADMIN), and nothing is deleted', async () => {
    const { member, orphaned } = await seedSessionCast()
    onSite(orphaned)
    await expect(deleteTaskSession({ sessionId: orphaned.id }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    await stillThere(orphaned.id)
  })

  it("a project's task session whose task was deleted is deleted by the project's admins, not a Member", async () => {
    const { member, project, orphanedInProject } = await seedSessionCast()
    onSite(orphanedInProject)
    await expect(deleteTaskSession({ sessionId: orphanedInProject.id }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await stillThere(orphanedInProject.id)
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.id } }, data: { role: 'ADMIN' } })
    await deleteTaskSession({ sessionId: orphanedInProject.id }, ctx(member))
    await gone(orphanedInProject.id)
  })

  it("the project's Viewer may not delete a task session (403 saying so), and nothing is deleted", async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectViewer(project.id, member.id)
    onSite(taskSession)
    await expect(deleteTaskSession({ sessionId: taskSession.id }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(await runStatus(taskSession.id)).toBe('RUNNING')
    await stillThere(taskSession.id)
  })
})

// A task session was reachable from the browser through these too (ChatSessionPage
// reads the session id from the URL), so it is gated by its project: 403 for an
// outsider. A session with no task keeps ADR-0041's owner-or-404.
describe('who may rename a session', () => {
  async function titles(sessionId: string) {
    return [(await prisma.agentSession.findUnique({ where: { id: sessionId } }))?.title, (await siteStore.getSession(SITE, sessionId))?.title]
  }

  it("a member of the task's project may rename its session, on the site and in hq", async () => {
    const { member, taskSession } = await seedSessionCast()
    onSite({ id: taskSession.id, title: 'Old' })
    await updateSession({ id: taskSession.id, title: 'New title' }, ctx(member))
    expect(await titles(taskSession.id)).toEqual(['New title', 'New title'])
  })

  it('an outsider may not — nothing renamed on the site, nothing written in hq', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    onSite({ id: taskSession.id, title: 'Old' })
    const before = (await prisma.agentSession.findUnique({ where: { id: taskSession.id } }))?.title
    await expect(updateSession({ id: taskSession.id, title: 'New title' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await titles(taskSession.id)).toEqual([before, 'Old'])
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    onSite({ id: taskSession.id, title: 'Old' })
    await expect(updateSession({ id: taskSession.id, title: 'New title' }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect((await titles(taskSession.id))[1]).toBe('Old')
  })

  it('a missing session answers 404', async () => {
    const { member } = await seedSessionCast()
    await expect(updateSession({ id: 'does-not-exist' }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a person cannot set the status of their own chat here: only archiving, on the site first, changes it', async () => {
    const { member, outsiderAdmin, chat } = await seedSessionCast()
    await expect(updateSession({ id: chat.id, status: 'ARCHIVED' }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateSession({ id: chat.id, status: 'ARCHIVED' }, ctx(member))).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateSession({ id: chat.id, status: 'EXPIRED' }, ctx(member))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.agentSession.findUnique({ where: { id: chat.id } }))?.status).toBe('ACTIVE')
  })
})

describe('who may archive a session', () => {
  async function statuses(sessionId: string) {
    return [(await prisma.agentSession.findUnique({ where: { id: sessionId } }))?.status, (await siteStore.getSession(SITE, sessionId))?.status]
  }

  it("a member of the task's project may archive its session, on the site and in hq", async () => {
    const { member, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await archiveSession({ id: taskSession.id }, ctx(member))
    expect(await statuses(taskSession.id)).toEqual(['ARCHIVED', 'ARCHIVED'])
  })

  it('an outsider may not — nothing archived on the site, nothing written in hq', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(archiveSession({ id: taskSession.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await statuses(taskSession.id)).toEqual(['ACTIVE', 'ACTIVE'])
  })

  it('the arbitrary administrator on the row is not an owner', async () => {
    const { routingAdmin, taskSession } = await seedSessionCast()
    onSite(taskSession)
    await expect(archiveSession({ id: taskSession.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await statuses(taskSession.id)).toEqual(['ACTIVE', 'ACTIVE'])
  })

  it('a missing session answers 404', async () => {
    const { member } = await seedSessionCast()
    await expect(archiveSession({ id: 'does-not-exist' }, ctx(member))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('a person may archive their own chat session; another person is answered 404 and nothing is archived', async () => {
    const { member, outsiderAdmin, chat } = await seedSessionCast()
    onSite(chat)
    await expect(archiveSession({ id: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(await statuses(chat.id)).toEqual(['ACTIVE', 'ACTIVE'])

    await archiveSession({ id: chat.id }, ctx(member))
    expect(await statuses(chat.id)).toEqual(['ARCHIVED', 'ARCHIVED'])
  })
})
