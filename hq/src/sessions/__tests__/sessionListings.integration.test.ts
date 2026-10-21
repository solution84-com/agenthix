/**
 * What the session reads and run feeds show, against the real test DB.
 *
 * - A chat is its owner's alone, ADMIN included (ADR-0041, SC-278), and a
 *   refusal is decided from hq's own copy without asking the site (SC-354).
 * - A run feed shows a chat run to its owner, a task run to its project
 *   (ADR-0062), and a task run whose task was deleted to everyone (SC-280).
 * - An Activity panel row whose site could not be asked says so rather
 *   than reading as a session that never ran.
 *
 * The sites are real registry rows; what each holds is the shared fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createSession, ensureExecutionSite } from '../../test/factories'
import { ctx, seedSessionCast } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getSession, getTaskSessions, getRecentActivity } from '../queries'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

beforeEach(async () => {
  await ensureExecutionSite({ siteId: SITE, protocolVersion: SITE_PROTOCOL_VERSION })
})

describe('getSession — a chat is its owner\'s alone @SC-278 @SC-354', () => {
  it('serves the owner their chat with its transcript', async () => {
    const { member, chat } = await seedSessionCast()
    siteStore.addTranscript(SITE, chat.id, [{ role: 'USER', content: 'hello' }])
    const result = await getSession({ id: chat.id }, ctx(member))
    expect(result.id).toBe(chat.id)
    expect(result.entries.map((e: { content: string }) => e.content)).toEqual(['hello'])
  })

  it('answers anyone else, an org admin included, 404 — decided without asking the site', async () => {
    const { outsiderAdmin, chat } = await seedSessionCast()
    siteStore.addTranscript(SITE, chat.id, [{ role: 'USER', content: 'private' }])
    await expect(getSession({ id: chat.id }, ctx(outsiderAdmin))).rejects.toMatchObject({ statusCode: 404 })
    expect(siteStore.listTranscript).not.toHaveBeenCalled()
  })

  // @SC-344 — never a silently empty transcript.
  it('503s when the transcript read fails because the owning site is unreachable', async () => {
    const { member, chat } = await seedSessionCast()
    siteStore.makeSiteUnreachable(SITE)
    await expect(getSession({ id: chat.id }, ctx(member))).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe('run feeds show each run only to whom it belongs @SC-280', () => {
  let n = 0
  function finished(id: string, sessionId: string, agentId: string) {
    siteStore.addRun(SITE, {
      id, sessionId, agentId, status: 'COMPLETED',
      startedAt: new Date(Date.UTC(2026, 0, 10, 0, 0, 59 - n++)).toISOString(), createdAt: '2026-01-01T00:00:00.000Z',
    })
  }
  async function feedCast() {
    const cast = await seedSessionCast()
    finished('r-private-task', cast.taskSession.id, cast.agent.id)
    finished('r-orphaned', cast.orphaned.id, cast.agent.id)
    finished('r-member-chat', cast.chat.id, cast.agent.id)
    return cast
  }
  const ids = (feed: { runs: Array<{ id: string }> }) => feed.runs.map((r) => r.id).sort()

  it("hides a private project's task run and another person's chat run from an outsider, an org admin included", async () => {
    const { outsiderAdmin } = await feedCast()
    expect(ids(await getRecentActivity(undefined, ctx(outsiderAdmin)))).toEqual(['r-orphaned'])
  })

  it('shows a member the project\'s task run alongside their own chat run, with the agent and session named', async () => {
    const { member, agent, chat } = await feedCast()
    const feed = await getRecentActivity(undefined, ctx(member))
    expect(ids(feed)).toEqual(['r-member-chat', 'r-orphaned', 'r-private-task'])
    expect(feed.runs.find((r: { id: string }) => r.id === 'r-member-chat')).toMatchObject({
      agent: { id: agent.id }, session: { id: chat.id },
    })
  })

  it('recent activity lists finished runs only', async () => {
    const { member, chat, agent } = await feedCast()
    siteStore.addRun(SITE, { id: 'r-running', sessionId: chat.id, agentId: agent.id, status: 'RUNNING', startedAt: '2026-01-11T00:00:00.000Z' })
    expect(ids(await getRecentActivity(undefined, ctx(member)))).not.toContain('r-running')
  })

  it('asks the database about only the projects the runs belong to', async () => {
    const { outsiderAdmin, project } = await feedCast()
    const projectQuery = vi.spyOn(prisma.project, 'findMany')
    await getRecentActivity(undefined, ctx(outsiderAdmin))
    expect(projectQuery).toHaveBeenCalledTimes(1)
    expect(projectQuery.mock.calls[0][0]).toMatchObject({ where: { id: { in: [project.id] } } })
    projectQuery.mockRestore()
  })

  it('makes no entitlement query at all when no run has a project', async () => {
    const { outsiderAdmin, orphaned, agent } = await seedSessionCast()
    finished('r-orphaned', orphaned.id, agent.id)
    const projectQuery = vi.spyOn(prisma.project, 'findMany')
    expect(ids(await getRecentActivity(undefined, ctx(outsiderAdmin)))).toEqual(['r-orphaned'])
    expect(projectQuery).not.toHaveBeenCalled()
    projectQuery.mockRestore()
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(getRecentActivity(undefined, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

// One detail per row comes from the row's own site.
describe('a listing row whose site could not be asked says so', () => {
  const row = (rows: Array<{ id: string }>, id: string) => rows.find((r) => r.id === id) as any

  it('the Activity panel: the row names its silent site instead of reading as a session that never ran', async () => {
    await prisma.executionSite.create({ data: { siteId: 'site-down', label: 'Laptop', status: 'ONLINE' } })
    const { member, taskSession } = await seedSessionCast()
    dispatchFake.placeSession(taskSession.id, 'site-down')
    siteStore.makeSiteUnreachable('site-down', new SiteUnreachableError('Laptop', 'site-down'))

    const listed = row(await getTaskSessions(undefined, ctx(member)), taskSession.id)

    expect(listed.AgentRun).toEqual([])
    expect(listed.siteSilence).toMatchObject({ siteId: 'site-down', label: 'Laptop', reason: 'offline' })
  })
})
