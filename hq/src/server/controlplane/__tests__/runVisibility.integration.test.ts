/**
 * What `fetch_my_queued_tasks` and `list_projects` show a run is decided by
 * the run's authority, never by the agent's (ADR-0060, adr-0101): what its
 * person is entitled to, and of that, what its boundary reaches — a chat in its
 * person's own storage all of it, a project's run its own project alone. A run
 * on behalf of no one sees nothing.
 *
 * Against the real test database: one open project, two private ones, and two
 * personal projects. The agent's own person is a member of every private
 * project, so any listing that widened from its memberships would show them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { ensureExecutionSite, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { fetchMyQueuedTasksOp } from '../taskOps'
import { listProjectsOp } from '../agentOps'
import type { CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'

const OPEN = 'prj_open'
const SECRET = 'prj_secret'
const OTHER = 'prj_other'
// Two personal projects (agents own schedule spec §4). THEIRS is given an open
// access level and an extra member row on purpose — neither may open it.
const MINE = 'prj_mine'
const THEIRS = 'prj_theirs'
const AGENT = 'agent-1'
const AGENT_USER = 'usr_agent_owner'
const MEMBER = 'usr_member'
const OUTSIDER = 'usr_outsider'

beforeEach(async () => {
  const site = await ensureExecutionSite()
  for (const id of [AGENT_USER, MEMBER, OUTSIDER]) await prisma.user.create({ data: { id } })
  await prisma.agent.create({ data: { id: AGENT, name: 'Agent', handle: AGENT } })
  await prisma.agentSession.create({ data: { id: 's1', userId: AGENT_USER, agentId: AGENT, sessionType: 'chat' } })
  const projects: Array<[string, 'OPEN' | 'PRIVATE', string | null, string[]]> = [
    [OPEN, 'OPEN', null, []],
    [SECRET, 'PRIVATE', null, [MEMBER, AGENT_USER]],
    [OTHER, 'PRIVATE', null, [AGENT_USER]],
    [MINE, 'PRIVATE', MEMBER, [MEMBER]],
    [THEIRS, 'OPEN', OUTSIDER, [OUTSIDER, AGENT_USER]],
  ]
  for (const [id, accessLevel, personalOwnerId, members] of projects) {
    await prisma.project.create({ data: { id, name: id, key: id.toUpperCase(), accessLevel, personalOwnerId, personalSpace: personalOwnerId !== null, executionSiteId: site.id } })
    for (const userId of members) await prisma.projectMember.create({ data: { projectId: id, userId } })
    // A queued task the agent would pick up: out of Backlog.
    await createTestTask({
      data: {
        id: `t-${id}`, title: `title ${id}`, projectId: id, state: 'TODO', number: 1,
        assignedAgentId: AGENT, runState: 'RUN_QUEUED', onBehalfOfUserId: MEMBER,
      },
    })
  }
})

function ctxOf(overrides: Partial<CapabilityClaims>): CallerContext {
  return {
    kind: 'run',
    claims: {
      tokenType: 'capability', userId: AGENT_USER, runner: { kind: 'person', userId: AGENT_USER }, startedBy: 'person' as const, agentId: AGENT, sessionId: 's1',
      projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'site-local',
      permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
      ...overrides,
    },
  }
}

const chatRun = (userId: string) => ctxOf({ userId, role: 'MEMBER' })
const taskRun = (projectId: string) => ctxOf({ projectId, taskId: `t-${projectId}` })

/** A connection is no agent, so it names the agent whose queue it reads. */
async function seenThrough(ctx: CallerContext) {
  const queued = (await fetchMyQueuedTasksOp(ctx, { agentId: AGENT })).tasks.map(t => t.projectId).sort()
  const projects = (await listProjectsOp(ctx, {})).projects.map(p => p.projectId).sort()
  return { queued, projects }
}

async function seen(ctx: CallerContext) {
  const queued = (await fetchMyQueuedTasksOp(ctx, {})).tasks.map(t => t.projectId).sort()
  const projects = (await listProjectsOp(ctx, {})).projects.map(p => p.projectId).sort()
  return { queued, projects }
}

describe('fetch_my_queued_tasks and list_projects follow the run, not the agent', () => {
  it('a chat run sees only the projects its person is a member of — not an open project they have not joined, and of personal projects only their own', async () => {
    expect(await seen(chatRun(OUTSIDER))).toEqual({ queued: [THEIRS], projects: [THEIRS] })
  })

  it("a chat run for a private project's member sees that project and no other private one", async () => {
    expect(await seen(chatRun(MEMBER))).toEqual({ queued: [SECRET, MINE].sort(), projects: [SECRET, MINE].sort() })
  })

  it("a chat run for someone on another person's personal project's member rows still does not see it", async () => {
    expect(await seen(chatRun(AGENT_USER))).toEqual({ queued: [SECRET, OTHER].sort(), projects: [SECRET, OTHER].sort() })
  })

  it("a personal project's task run sees its own personal project alone", async () => {
    expect(await seen(ctxOf({ userId: MEMBER, runner: { kind: 'person', userId: MEMBER }, projectId: MINE, taskId: 't-prj_mine' })))
      .toEqual({ queued: [MINE], projects: [MINE] })
  })

  it("a task run sees only its own project, and only while its task's person is a member of it (adr-0101)", async () => {
    expect(await seen(taskRun(SECRET))).toEqual({ queued: [SECRET], projects: [SECRET] })
    expect(await seen(taskRun(OPEN))).toEqual({ queued: [], projects: [] })
  })

  it('a run on behalf of no one — its task gone — is refused', async () => {
    const orphan = ctxOf({ projectId: SECRET, taskId: 'gone' })
    await expect(fetchMyQueuedTasksOp(orphan, {})).rejects.toMatchObject({ code: 'forbidden' })
    await expect(listProjectsOp(orphan, {})).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('the role a capability carries changes nothing: a chat sees what its person is entitled to', async () => {
    const noRole = ctxOf({ role: undefined as unknown as CapabilityClaims['role'] })
    expect(await seen(noRole)).toEqual({ queued: [SECRET, OTHER].sort(), projects: [SECRET, OTHER].sort() })
  })

  it("a person's connection sees what its person does — an org admin's too, never every project (adr-0090)", async () => {
    expect(await seenThrough(connectionCaller({ userId: MEMBER, role: 'ADMIN' })))
      .toEqual({ queued: [SECRET, MINE].sort(), projects: [SECRET, MINE].sort() })
  })

  it('a connection limited to chosen projects sees those its person is entitled to, and no other', async () => {
    expect(await seenThrough(connectionCaller({ userId: MEMBER, projectIds: [SECRET, OTHER, THEIRS] })))
      .toEqual({ queued: [SECRET], projects: [SECRET] })
  })
})
