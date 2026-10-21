/**
 * Before a project is deleted its running work stops (`stopProjectRuns`),
 * against the real test DB: the project's sessions are found by owner and by
 * task, each is resolved to its site for real, and the site — the shared fake —
 * is asked to cancel their active runs until none is left. A delete that cannot
 * confirm it is refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, ensureExecutionSite } from '../../test/factories'
import { makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { stopProjectRuns } from '../projectRunStop'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const noWait = { sleep: async () => undefined }

beforeEach(async () => {
  await ensureExecutionSite({ siteId: SITE })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

/** A project with a chat working in it and a task session, each with a running run, and a run elsewhere on the site. */
async function busyProject() {
  const project = await createProject()
  const user = await createUser()
  const agent = await createAgent()
  const chat = await createSession({ userId: user.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
  const task = await makeTask(project.id)
  const taskSession = await createSession({ userId: user.id, agentId: agent.id, sessionType: 'task', taskId: task.id })
  siteStore.addRun(SITE, { id: 'r-chat', sessionId: chat.id, status: 'RUNNING' })
  siteStore.addRun(SITE, { id: 'r-task', sessionId: taskSession.id, status: 'PENDING' })
  siteStore.addRun(SITE, { id: 'r-foreign', sessionId: 'someone-elses', status: 'RUNNING' })
  return { project, chat, taskSession }
}
const statusOf = async (id: string) => (await siteStore.getRun(SITE, id))?.status

describe('stopProjectRuns', () => {
  it("cancels the project's own active runs, found by owner and by task, and nothing else", async () => {
    const { project } = await busyProject()

    await stopProjectRuns(project.id, SITE, noWait)

    expect(siteStore.cancelledRuns.map((c) => c.runId).sort()).toEqual(['r-chat', 'r-task'])
    expect(await statusOf('r-foreign')).toBe('RUNNING')
  })

  it('asks no site anything for a project with no sessions', async () => {
    const project = await createProject()
    await stopProjectRuns(project.id, SITE, noWait)
    expect(siteStore.listRuns).not.toHaveBeenCalled()
  })

  it('refuses when runs are still active at the bound', async () => {
    const { project } = await busyProject()
    siteStore.cancelRun.mockImplementation(async () => undefined) // the site acknowledges, but nothing stops
    await expect(stopProjectRuns(project.id, SITE, { timeoutMs: 0, ...noWait })).rejects.toMatchObject({
      statusCode: 409, message: expect.stringContaining('could not be confirmed stopped'),
    })
  })

  it('refuses when the site cannot be reached', async () => {
    const { project } = await busyProject()
    siteStore.makeSiteUnreachable(SITE)
    await expect(stopProjectRuns(project.id, SITE, noWait)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('does not wait on a revoked site, which can never answer again', async () => {
    const { project } = await busyProject()
    siteStore.makeSiteUnreachable(SITE, new SiteUnreachableError('Gone', SITE, 'revoked'))
    await expect(stopProjectRuns(project.id, SITE, noWait)).resolves.toBeUndefined()
  })

  it("asks the project's own site about a session whose placement is gone", async () => {
    const project = await createProject()
    const user = await createUser()
    // A chat in a workspace the site no longer places resolves nowhere.
    const lost = await createSession({ userId: user.id, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-gone' })
    siteStore.addRun('site-home', { id: 'r-lost', sessionId: lost.id, status: 'RUNNING' })

    await stopProjectRuns(project.id, 'site-home', noWait)

    expect(siteStore.cancelledRuns).toEqual([{ siteId: 'site-home', runId: 'r-lost' }])
  })

  it('asks per session when the site-wide page is full and may be hiding rows', async () => {
    const { project } = await busyProject()
    for (let i = 0; i < 1000; i++) siteStore.addRun(SITE, { id: `x${i}`, sessionId: 'foreign', status: 'RUNNING' })

    await stopProjectRuns(project.id, SITE, noWait)

    expect(siteStore.cancelledRuns.map((c) => c.runId).sort()).toEqual(['r-chat', 'r-task'])
    expect(await prisma.agentSession.count()).toBe(2)
  })
})
