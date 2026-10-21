import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUserWithRole, joinProjectAs } from '../../test/factories'

// Recent errors (logs and diagnostics spec), against the real test database:
// what a failed run, a site's problem and HQ's own failure leave behind, and
// what an admin is shown of them. Only the channel's ownership check is replaced.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const h = vi.hoisted(() => ({ owned: vi.fn(async (_sessionId: string, siteId: string) => siteId !== 'foreign-site') }))
vi.mock('../../sites/channel/sessionOwnerSite', () => ({ sessionOwnedBy: h.owned }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { recordRunFailure } from '../runFailures'
import { recordSiteProblems } from '../siteConditions'
import { CONDITION_GAP_MS, RECENT_ERRORS_KEPT_MS, pruneRecordedErrors, recordError } from '../recordedErrors'
import { readRecentErrors } from '../recentErrors'
import { SCHEDULER_FAILED } from '../errorAdvice'

const SITE = 'site-build-2'

function frame(over: Partial<RunStatusEvent>): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 's', taskId: null, agentId: 'a', agentHandle: 'a', status: 'FAILED',
    error: "Claude login expired for this run's person", sessionPatch: null, manifestPending: null,
    ...over,
  }
}

let admin: { id: string }
beforeEach(async () => {
  vi.clearAllMocks()
  admin = await createUserWithRole('ADMIN')
  await prisma.executionSite.create({ data: { siteId: SITE, label: 'Build server 2', status: 'ONLINE' } as any })
})

async function taskRun(opts: { open?: boolean; member?: boolean } = {}) {
  const agent = await createAgent({ name: 'Frontend dev' })
  const project = await createProject({ name: 'Website Redesign', accessLevel: opts.open === false ? 'PRIVATE' : 'OPEN' })
  if (opts.member !== false) await joinProjectAs(project.id, admin.id)
  const task = await createTestTask({ data: { title: 'Fix the header', projectId: project.id, number: 41, onBehalfOfUserId: admin.id } })
  const session = await createSession({ agentId: agent.id, taskId: task.id, sessionType: 'task' })
  return { agent, project, session }
}

describe('a failed run @SC-726', () => {
  it('is one problem with a count, saying what to do, and links a task run to its run', async () => {
    const { agent, project, session } = await taskRun()
    await recordRunFailure(frame({ runId: 'run-1', sessionId: session.id }), SITE)
    await new Promise(r => setTimeout(r, 5))
    await recordRunFailure(frame({ runId: 'run-2', sessionId: session.id }), SITE)

    const { groups } = await readRecentErrors(admin.id, '24h')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      origin: 'run',
      title: 'A run could not sign in to its model',
      advice: expect.stringContaining('Settings › Your model logins'),
      count: 2,
      agent: { id: agent.id, name: 'Frontend dev' },
      project: { id: project.id, name: 'Website Redesign' },
      site: { siteId: SITE, label: 'Build server 2' },
      runLink: `/runs/run-2?session=${session.id}`,
      chatRun: false,
    })
  })

  it('counts once when the same run is reported twice', async () => {
    const { session } = await taskRun()
    await recordRunFailure(frame({ runId: 'run-1', sessionId: session.id }), SITE)
    await recordRunFailure(frame({ runId: 'run-1', sessionId: session.id }), SITE)
    expect((await readRecentErrors(admin.id, '24h')).groups[0].count).toBe(1)
  })

  it("another person's chat run shows the error, the agent and the site, never the person, the conversation or a link @SC-727", async () => {
    const someone = await createUserWithRole('MEMBER', { displayName: 'Dana' })
    const agent = await createAgent({ name: 'Project manager' })
    const chat = await createSession({ userId: someone.id, agentId: agent.id })
    await recordRunFailure(frame({ runId: 'chat-run', sessionId: chat.id, error: 'Run limit reached: 200 turns' }), SITE)

    const [group] = (await readRecentErrors(admin.id, '24h')).groups
    expect(group).toMatchObject({ chatRun: true, project: null, runLink: null, agent: { name: 'Project manager' }, detail: 'Run limit reached: 200 turns' })
    const row = await prisma.recordedError.findFirstOrThrow()
    expect(row).toMatchObject({ runId: null, sessionId: null, projectId: null })
    expect(JSON.stringify(group)).not.toContain(someone.id)
    expect(JSON.stringify(group)).not.toContain(chat.id)
  })

  it('names a project only to an admin who may see it, and links its run only for one who may open it @SC-727', async () => {
    const { session } = await taskRun({ open: false, member: false })
    await recordRunFailure(frame({ sessionId: session.id }), SITE)
    expect((await readRecentErrors(admin.id, '24h')).groups[0]).toMatchObject({ project: null, runLink: null, chatRun: false })
  })

  it('ignores a frame from a site that does not own the run, and a run that did not fail @SC-727', async () => {
    const { session } = await taskRun()
    await recordRunFailure(frame({ sessionId: session.id }), 'foreign-site')
    await recordRunFailure(frame({ sessionId: session.id, status: 'COMPLETED', error: null }), SITE)
    expect(await prisma.recordedError.count()).toBe(0)
  })

  it('keeps no secret the error carried', async () => {
    const { session } = await taskRun()
    await recordRunFailure(frame({ sessionId: session.id, error: '401 invalid api key sk-ant-api03-abcdefghijklmnopqrstuvwxyz' }), SITE)
    const row = await prisma.recordedError.findFirstOrThrow()
    expect(row.detail).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
  })
})

describe("a site's problem @SC-726", () => {
  it('is one stretch while it lasts, since when it began, and a new one after it cleared', async () => {
    const start = new Date()
    const site = { siteId: SITE, label: 'Build server 2', isDefault: false }
    await recordSiteProblems(site, [{ kind: 'dockerDown' }], start)
    await recordSiteProblems(site, [{ kind: 'dockerDown' }], new Date(start.getTime() + 30_000))

    let [group] = (await readRecentErrors(admin.id, '24h', new Date(start.getTime() + 31_000))).groups
    expect(group).toMatchObject({ origin: 'site', title: 'Docker is not running on Build server 2', count: 1, ongoing: true, firstAt: start })
    expect(group.siteLink).toMatch(/^\/org\/settings\/where-work-runs\//)

    const later = new Date(start.getTime() + CONDITION_GAP_MS + 120_000)
    await recordSiteProblems(site, [{ kind: 'dockerDown' }], later)
    ;[group] = (await readRecentErrors(admin.id, '24h', later)).groups
    expect(group.count).toBe(2)
  })
})

describe("HQ's own failures, and how long errors are kept @SC-726", () => {
  it('shows the last 24 hours, or all 7 days, and drops what is older', async () => {
    const now = new Date()
    await recordError({ origin: 'scheduler', subject: 'tick', advice: SCHEDULER_FAILED, detail: 'boom', at: new Date(now.getTime() - 3 * 24 * 3600_000) })
    await recordError({ origin: 'scheduler', subject: 'tick', advice: SCHEDULER_FAILED, detail: 'old', at: new Date(now.getTime() - RECENT_ERRORS_KEPT_MS - 60_000) })

    expect((await readRecentErrors(admin.id, '24h', now)).groups).toHaveLength(0)
    expect((await readRecentErrors(admin.id, '7d', now)).groups[0]).toMatchObject({ title: "HQ's scheduler could not run", count: 1 })

    expect(await pruneRecordedErrors(now)).toBe(1)
    expect(await prisma.recordedError.count()).toBe(1)
  })
})
