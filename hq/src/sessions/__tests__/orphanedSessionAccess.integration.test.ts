/**
 * A task session whose task was deleted, against the real test DB: nobody reads it or sends into it — the admin its
 * row names as a routing identity included — and what is done to it (cancelling a run, archiving) is its project's
 * admins', as stopping and deleting it are (sessionControl.integration.test.ts). Beside it, who may send into a
 * task's session by every project role, and the words a refusal gives.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { ctx, seedSessionCast, makeProjectViewer, setRole } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { triggerAgentRun, cancelAgentRun, updateSession, archiveSession } from '../actions'
import { tryAgain, summariseConversation } from '../conversationActions'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const dispatched = () => dispatchFake.dispatchedChatRuns.map((r) => r.sessionId)

async function routingAdminWorksInProject(projectId: string, userId: string) {
  await prisma.projectMember.create({ data: { projectId, userId, role: 'MEMBER' } })
}

async function makeProjectAdmin(projectId: string, userId: string) {
  await prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: 'ADMIN' } })
}

describe('a task session whose task was deleted', () => {
  it('takes no message, Try again or Summarise now from the admin its row names, though they work in the project', async () => {
    const { routingAdmin, project, orphanedInProject } = await seedSessionCast()
    await routingAdminWorksInProject(project.id, routingAdmin.id)
    await expect(triggerAgentRun({ sessionId: orphanedInProject.id, inputText: 'hi' }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(tryAgain({ sessionId: orphanedInProject.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(summariseConversation({ sessionId: orphanedInProject.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(dispatched()).toEqual([])
  })

  it('is renamed by nobody, the admin its row names included', async () => {
    const { routingAdmin, orphaned } = await seedSessionCast()
    siteStore.addSession(SITE, { id: orphaned.id, title: 'Old' })
    await expect(updateSession({ id: orphaned.id, title: 'New' }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect((await siteStore.getSession(SITE, orphaned.id))?.title).toBe('Old')
  })

  it("has a run cancelled by its project's admins only: not a Member, not the admin its row names", async () => {
    const { member, routingAdmin, project, orphanedInProject } = await seedSessionCast()
    await routingAdminWorksInProject(project.id, routingAdmin.id)
    const run = siteStore.addRun(SITE, { id: 'run-orphan', sessionId: orphanedInProject.id, status: 'RUNNING' })
    for (const refused of [member, routingAdmin]) {
      await expect(cancelAgentRun({ runId: run.id, sessionId: orphanedInProject.id }, ctx(refused)))
        .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('admin of this project') })
    }
    expect((await siteStore.getRun(SITE, run.id))?.status).toBe('RUNNING')
    await makeProjectAdmin(project.id, member.id)
    await cancelAgentRun({ runId: run.id, sessionId: orphanedInProject.id }, ctx(member))
    expect((await siteStore.getRun(SITE, run.id))?.status).toBe('CANCELLED')
  })

  it("is archived by its project's admins only, and the admin its row names is refused with nothing archived", async () => {
    const { member, routingAdmin, project, orphanedInProject } = await seedSessionCast()
    await routingAdminWorksInProject(project.id, routingAdmin.id)
    siteStore.addSession(SITE, { id: orphanedInProject.id, title: null })
    await expect(archiveSession({ id: orphanedInProject.id }, ctx(routingAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.agentSession.findUnique({ where: { id: orphanedInProject.id } }))?.status).toBe('ACTIVE')
    await makeProjectAdmin(project.id, member.id)
    await archiveSession({ id: orphanedInProject.id }, ctx(member))
    expect((await prisma.agentSession.findUnique({ where: { id: orphanedInProject.id } }))?.status).toBe('ARCHIVED')
  })
})

describe("who may send into a task's session, by project role", () => {
  it("a project Admin may, as a Member may", async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectAdmin(project.id, member.id)
    await triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(member))
    expect(dispatched()).toEqual([taskSession.id])
  })

  it('its Viewer is refused, an organisation admin too, told who to ask and that nothing was changed', async () => {
    const { member, project, taskSession } = await seedSessionCast()
    await makeProjectViewer(project.id, member.id)
    await setRole(member.id, 'ADMIN')
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(member))).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/needs the Member or Admin role in this project\. .*ask one of its admins\. Nothing was changed\.$/),
    })
    expect(dispatched()).toEqual([])
  })

  it('someone not on the project is refused, told who to ask and that nothing was changed', async () => {
    const { outsiderAdmin, taskSession } = await seedSessionCast()
    await expect(triggerAgentRun({ sessionId: taskSession.id, inputText: 'hi' }, ctx(outsiderAdmin))).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/requires membership of this project; ask one of its admins to add you\. Nothing was changed\.$/),
    })
    expect(dispatched()).toEqual([])
  })
})
