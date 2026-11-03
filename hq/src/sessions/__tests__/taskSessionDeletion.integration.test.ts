/**
 * A task's conversation is deleted with the task, against the real test DB: its running work is stopped, its
 * session deleted on the site that holds it (transcript and runs with it), then hq's copy with the task — so
 * nothing of it is left for anyone to read. A site that cannot be reached refuses the delete and nothing in hq
 * changes. Deleting a project does the same for every task in it. The site is the shared fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, ensureExecutionSite } from '../../test/factories'
import { makeTask } from '../../projects/__tests__/projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { deleteTask, deleteProject } from '../../projects/projectService'
import { deleteTaskSessionsOnSites } from '../taskSessionDeletion'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

beforeEach(async () => {
  await ensureExecutionSite({ siteId: SITE })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

async function taskWithConversation() {
  const project = await createProject({ accessLevel: 'PRIVATE' })
  const user = await createUser()
  const agent = await createAgent()
  const task = await makeTask(project.id)
  const session = await createSession({ userId: user.id, agentId: agent.id, sessionType: 'task', taskId: task.id })
  siteStore.addSession(SITE, { id: session.id, sessionType: 'task', taskId: task.id })
  siteStore.addRun(SITE, { id: 'r-done', sessionId: session.id, status: 'COMPLETED' })
  siteStore.addTranscript(SITE, session.id, [{ role: 'USER', content: 'secret plan' }])
  return { project, task, session }
}

describe('deleting a task', () => {
  it('deletes its conversation on the site and in hq, with the task', async () => {
    const { task, session } = await taskWithConversation()
    siteStore.addRun(SITE, { id: 'r-live', sessionId: session.id, status: 'RUNNING' })

    await deleteTask(task.id)

    expect(siteStore.cancelledRuns.map((c) => c.runId)).toEqual(['r-live'])
    expect(await siteStore.getSession(SITE, session.id)).toBeNull()
    expect(await siteStore.getRun(SITE, 'r-done')).toBeNull()
    expect(await siteStore.listTranscript(SITE, session.id, {})).toEqual([])
    expect(await prisma.agentSession.findUnique({ where: { id: session.id } })).toBeNull()
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
  })

  it('is refused while the site holding its conversation cannot be reached, and nothing in hq changes', async () => {
    const { task, session } = await taskWithConversation()
    siteStore.makeSiteUnreachable(SITE)

    await expect(deleteTask(task.id)).rejects.toMatchObject({ statusCode: 503 })
    expect(await prisma.agentSession.findUnique({ where: { id: session.id } })).not.toBeNull()
    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull()
  })

  it('still goes when its site was revoked, which can never be asked again, and hq keeps nothing of it', async () => {
    const { task, session } = await taskWithConversation()
    siteStore.makeSiteUnreachable(SITE, new SiteUnreachableError('Gone', SITE, 'revoked'))

    await deleteTask(task.id)
    expect(await prisma.agentSession.findUnique({ where: { id: session.id } })).toBeNull()
  })

  it('asks no site anything for a task that never ran', async () => {
    const project = await createProject()
    const task = await makeTask(project.id)
    await deleteTask(task.id)
    expect(siteStore.deleteSessionsBy).not.toHaveBeenCalled()
  })
})

describe("deleting a project's tasks' conversations", () => {
  it('deletes each on the site, and hq drops its copies with the project', async () => {
    const { project, session } = await taskWithConversation()
    const other = await taskWithConversation()

    await deleteTaskSessionsOnSites({ projectId: project.id }, SITE)
    expect(await siteStore.getSession(SITE, session.id)).toBeNull()
    expect(await siteStore.getSession(SITE, other.session.id)).not.toBeNull()

    await deleteProject(project.id)
    expect(await prisma.agentSession.findUnique({ where: { id: session.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: other.session.id } })).not.toBeNull()
  })
})
