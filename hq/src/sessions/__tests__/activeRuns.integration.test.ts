/**
 * The running-now view (person-scoped execution spec §3): `resolveActiveRuns`
 * and its project query, against the real test DB. The boundary's site comes
 * from the database; the site itself is the shared fake, and the one batch read
 * of workspace names, which also crosses to the site, is stubbed per test.
 * Nothing of a run's content reaches the view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, ensureExecutionSite } from '../../test/factories'
import { makeTaskInProject } from './sessionActionsHarness'

const listWorkspacesByOwner = vi.hoisted(() => vi.fn())
vi.mock('../../storage/workspaceStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/workspaceStore')>()),
  listWorkspacesByOwner,
}))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { resolveActiveRuns } from '../activeRuns'
import { getProjectActiveRuns } from '../activeRunsQueries'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

beforeEach(async () => {
  listWorkspacesByOwner.mockReset().mockResolvedValue([])
  await ensureExecutionSite({ siteId: SITE })
})

function person(username: string) {
  return createUser({ auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } } } })
}
async function projectOnSite(data: Record<string, unknown> = {}) {
  return createProject({ name: 'Running', ...data })
}
function activeRun(id: string, sessionId: string, agentId: string, over: Record<string, unknown> = {}) {
  return siteStore.addRun(SITE, {
    id, sessionId, agentId, status: 'RUNNING', startedAt: '2026-09-28T10:00:00.000Z', createdAt: '2026-09-28T09:59:00.000Z', ...over,
  })
}

describe('scope follows the boundary it is asked for', () => {
  it("asks the site holding the boundary's storage, for exactly that boundary", async () => {
    const project = await projectOnSite()
    await resolveActiveRuns('project', project.id)
    expect(siteStore.listActiveRuns).toHaveBeenCalledWith(SITE, { ownerType: 'project', ownerId: project.id })
  })

  it('a personal boundary asks for the person, on the default site', async () => {
    const alice = await person('alice')
    await resolveActiveRuns('user', alice.id)
    expect(siteStore.listActiveRuns).toHaveBeenCalledWith(SITE, { ownerType: 'user', ownerId: alice.id })
  })

  it('refuses a project that names no site', async () => {
    const unplaced = await createProject({ executionSiteId: null })
    await expect(resolveActiveRuns('project', unplaced.id)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('resolving names — no content leaks through', () => {
  it('a chat run resolves the agent name and the person, never a session title', async () => {
    const alice = await person('alice')
    const agent = await createAgent({ name: 'Aria' })
    const session = await createSession({ userId: alice.id, agentId: agent.id, title: 'Secret plans' })
    activeRun('run-1', session.id, agent.id)

    const [view] = await resolveActiveRuns('project', (await projectOnSite()).id)

    expect(view).toEqual({
      runId: 'run-1', agentId: agent.id, agentName: 'Aria', status: 'RUNNING', since: '2026-09-28T10:00:00.000Z',
      startedBy: { kind: 'person', userId: alice.id, name: 'alice' }, location: { kind: 'files' }, sharesWorkspace: false,
    })
    expect(JSON.stringify(view)).not.toMatch(/Secret|title|inputText|outputText|content/i)
  })

  it('a task run resolves the task title, not the person on its session', async () => {
    const routing = await person('routing-admin')
    const agent = await createAgent()
    const project = await projectOnSite()
    const task = await prisma.task.update({ where: { id: (await makeTaskInProject(project.id)).id }, data: { title: 'Fix the thing' } })
    const session = await createSession({ userId: routing.id, agentId: agent.id, sessionType: 'task', taskId: task.id })
    activeRun('run-2', session.id, agent.id, { taskId: task.id, status: 'PENDING', startedAt: null, createdAt: '2026-09-28T09:00:00.000Z' })

    const [view] = await resolveActiveRuns('project', project.id)

    expect(view.startedBy).toEqual({ kind: 'task', taskId: task.id, title: 'Fix the thing' })
    expect(view.location).toEqual({ kind: 'task', taskId: task.id })
    expect(view.since).toBe('2026-09-28T09:00:00.000Z')
  })

  it('a run in a workspace resolves the workspace name through the batch names read', async () => {
    const alice = await person('alice')
    const agent = await createAgent()
    const project = await projectOnSite()
    const session = await createSession({ userId: alice.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-1' })
    activeRun('run-3', session.id, agent.id)
    listWorkspacesByOwner.mockResolvedValue([{ id: 'ws-1', name: 'web' }])

    const [view] = await resolveActiveRuns('project', project.id)

    expect(view.location).toEqual({ kind: 'workspace', workspaceId: 'ws-1', name: 'web' })
    expect(listWorkspacesByOwner).toHaveBeenCalledWith(SITE, 'project', project.id, 'names')
  })

  it('an empty site answers an empty list', async () => {
    expect(await resolveActiveRuns('project', (await projectOnSite()).id)).toEqual([])
  })
})

describe('the shared-workspace flag', () => {
  it('flags two runs in the same workspace, and not one alone in another', async () => {
    const agent = await createAgent()
    const project = await projectOnSite()
    const sessionIn = async (username: string, ws: string) => createSession({
      userId: (await person(username)).id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: ws,
    })
    activeRun('run-a', (await sessionIn('alice', 'ws-1')).id, agent.id)
    activeRun('run-b', (await sessionIn('bob', 'ws-1')).id, agent.id)
    activeRun('run-c', (await sessionIn('carl', 'ws-2')).id, agent.id)
    listWorkspacesByOwner.mockResolvedValue([{ id: 'ws-1', name: 'web' }, { id: 'ws-2', name: 'api' }])

    const views = await resolveActiveRuns('project', project.id)

    expect(Object.fromEntries(views.map((v) => [v.runId, v.sharesWorkspace]))).toEqual({ 'run-a': true, 'run-b': true, 'run-c': false })
  })
})

describe('an unreachable site', () => {
  it('propagates the site read failure rather than resolving to an empty list', async () => {
    siteStore.makeSiteUnreachable(SITE, new Error('Execution Site "Box" is unreachable'))
    await expect(resolveActiveRuns('project', (await projectOnSite()).id)).rejects.toThrow('Execution Site "Box" is unreachable')
  })
})

describe('getProjectActiveRuns', () => {
  it('refuses a caller who is not signed in', async () => {
    const project = await projectOnSite()
    await expect(getProjectActiveRuns({ projectId: project.id }, {})).rejects.toMatchObject({ statusCode: 401 })
  })

  it('answers a non-member of a private project as not found, without reaching the site', async () => {
    const outsider = await createUser()
    const project = await projectOnSite({ accessLevel: 'PRIVATE' })
    await expect(getProjectActiveRuns({ projectId: project.id }, { user: { id: outsider.id } })).rejects.toMatchObject({ statusCode: 404 })
    expect(siteStore.listActiveRuns).not.toHaveBeenCalled()
  })

  it("gives a member the project's own runs", async () => {
    const member = await createUser()
    const agent = await createAgent({ name: 'Aria' })
    const project = await projectOnSite({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    const session = await createSession({ userId: member.id, agentId: agent.id })
    activeRun('run-1', session.id, agent.id)

    const views = await getProjectActiveRuns({ projectId: project.id }, { user: { id: member.id } })

    expect(views.map((v) => v.runId)).toEqual(['run-1'])
    expect(siteStore.listActiveRuns).toHaveBeenCalledWith(SITE, { ownerType: 'project', ownerId: project.id })
  })

  // Agents own schedule spec §4: a personal project's runs are in its person's storage.
  it("shows a personal project's person's own storage, never a project boundary", async () => {
    const owner = await createUser()
    const project = await projectOnSite({ accessLevel: 'PRIVATE', personalOwnerId: owner.id })

    await getProjectActiveRuns({ projectId: project.id }, { user: { id: owner.id } })

    expect(siteStore.listActiveRuns).toHaveBeenCalledWith(SITE, { ownerType: 'user', ownerId: owner.id })
  })
})
