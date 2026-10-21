/**
 * Which site a run, a session or an agent's runs live on, against the real database. A caller that arrives
 * after dispatch — a manifest approval, a cancel, the task machine — reaches a run's site the way the mint
 * placed it, without minting again; an agent's runs are spread over every site its sessions work on, whatever
 * its own anchor says.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, createTestTask } from '../../test/factories'
import { agentWithContent, readyToDispatch } from './dispatchFixtures'
import { secondSite } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})

import { resolveSiteIdForSession, resolveSiteIdForTask } from '../dispatchSiteResolution'
import { resolveAgentSiteId, sitesForAgent, sitesForSessions } from '../agentSite'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'

let here: Awaited<ReturnType<typeof readyToDispatch>>['site']
let there: Awaited<ReturnType<typeof secondSite>>
beforeEach(async () => {
  ;({ site: here } = await readyToDispatch())
  there = await secondSite()
})

const placeWorkspace = (workspaceId: string, siteId: string) => prisma.workspacePlacement.create({ data: { workspaceId, siteId } })

describe("reaching a run's site without minting", () => {
  it('places a task run by its project', async () => {
    const project = await createProject({ name: 'Far', executionSiteId: there.id })
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: (await createUser()).id } })
    expect(await resolveSiteIdForTask(task.id)).toBe(there.siteId)
  })

  it("places a personal project's task in its person's own storage (agents own schedule spec §4)", async () => {
    const owner = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: owner.id, siteId: there.id } })
    const project = await createProject({ name: 'Mine', personalOwnerId: owner.id, executionSiteId: here.id, accessLevel: 'PRIVATE' })
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: owner.id } })
    expect(await resolveSiteIdForTask(task.id)).toBe(there.siteId)
  })

  it('refuses a task that no longer exists rather than naming some site anyway', async () => {
    await expect(resolveSiteIdForTask('task-gone')).rejects.toThrow('Task task-gone not found')
  })

  it('places a session by the location its row names — a workspace by its own placement', async () => {
    const person = await createUser()
    const project = await createProject({ name: 'P', executionSiteId: here.id })
    await placeWorkspace('ws-3', there.id)
    expect(await resolveSiteIdForSession({ userId: person.id, sessionType: 'chat', taskId: null, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-3' })).toBe(there.siteId)
    expect(await resolveSiteIdForSession({ userId: person.id, sessionType: 'chat', taskId: null, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null })).toBe(here.siteId)
  })

  it("places a session with no location of its own in its person's storage", async () => {
    const person = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: person.id, siteId: there.id } })
    expect(await resolveSiteIdForSession({ userId: person.id, sessionType: 'chat', taskId: null, primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null })).toBe(there.siteId)
  })
})

describe('the sites an agent works across', () => {
  async function agentWithSessions() {
    const agent = await agentWithContent()
    const person = await createUser()
    await placeWorkspace('ws-1', there.id)
    const project = await createProject({ name: 'P', executionSiteId: here.id })
    return { agent, person, project }
  }

  it('resolves a workspace-primary session and a project-primary one of the same owner to different sites', async () => {
    const { agent, person, project } = await agentWithSessions()
    await createSession({ agentId: agent.id, userId: person.id, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-1' })
    await createSession({ agentId: agent.id, userId: person.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    expect((await sitesForAgent(agent.id)).siteIds.sort()).toEqual([here.siteId, there.siteId].sort())
  })

  it('names each site once, and reads its sessions, never its own anchor', async () => {
    const { agent, person, project } = await agentWithSessions()
    const other = await createProject({ name: 'Q', executionSiteId: here.id })
    for (const p of [project, other, project]) await createSession({ agentId: agent.id, userId: person.id, primaryOwnerType: 'project', primaryOwnerId: p.id })
    expect(await sitesForAgent(agent.id)).toEqual({ siteIds: [here.siteId], unresolved: 0 })
  })

  it('an agent with no sessions has had no runs, and names no site', async () => {
    const agent = await agentWithContent()
    expect(await sitesForAgent(agent.id)).toEqual({ siteIds: [], unresolved: 0 })
  })

  it('passes over a session that names no site, counts it, and still answers for the rest', async () => {
    const { agent, person, project } = await agentWithSessions()
    await createSession({ agentId: agent.id, userId: person.id, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-unplaced' })
    await createSession({ agentId: agent.id, userId: person.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    expect(await sitesForAgent(agent.id)).toEqual({ siteIds: [here.siteId], unresolved: 1 })
  })

  it('raises on a failure that is not a refusal, rather than reporting fewer sites than there are', async () => {
    const { project } = await agentWithSessions()
    const lookup = vi.spyOn(prisma.project, 'findUnique').mockRejectedValueOnce(new Error('connection reset'))
    try {
      await expect(sitesForSessions([{ id: 's', userId: 'u', sessionType: 'chat', taskId: null, primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null }]))
        .rejects.toThrow('connection reset')
    } finally {
      lookup.mockRestore()
    }
  })

  it('a question about the agent itself goes to the default site, and fails with the shared error when there is none', async () => {
    expect(await resolveAgentSiteId()).toBe(here.siteId)
    await prisma.executionSite.update({ where: { id: here.id }, data: { status: 'REVOKED' } })
    await expect(resolveAgentSiteId()).rejects.toMatchObject({ statusCode: 503, message: NO_EXECUTION_SITE_MESSAGE })
  })
})
