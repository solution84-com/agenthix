/** The Automation tool's Now and Later against Postgres (every screen reviewed spec §3): running, stuck with its fix, and what will start. */
import { describe, it, expect, vi } from 'vitest'
import { createAgent, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getAutomationOutlook, projectAutomationOutlook } from '../automationOutlook'
import { LOST_ACCESS_REASON, NO_AGENT_REASON } from '../../agents/taskExecutionReasons'
import { addMember, ctx, privateProject, refusedWith, routineIn, taskIn } from './automationWorld'

const NOW = new Date('2026-10-06T10:00:00Z')

describe('getAutomationOutlook @SC-511', () => {
  it('refuses nobody signed in, and someone outside a private project', async () => {
    const project = await privateProject()
    await refusedWith(getAutomationOutlook({ projectId: project.id }, ctx()), 401)
    await refusedWith(getAutomationOutlook({ projectId: project.id }, ctx(await createUser())), 403)
  })

  it('answers a member', async () => {
    const project = await privateProject()
    const member = await createUser()
    await addMember(project.id, member.id)
    expect(await getAutomationOutlook({ projectId: project.id }, ctx(member))).toEqual({ projectKey: project.key, running: [], stuck: [], later: [], laterMore: 0 })
  })
})

describe("a project's outlook @SC-511", () => {
  it('names the tasks running, by key', async () => {
    const project = await privateProject({ key: 'WEB' })
    const agent = await createAgent()
    const first = await taskIn(project.id, { runState: 'RUN_ACTIVE', assignedAgentId: agent.id, title: 'Nav' })
    await taskIn(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id })
    await taskIn(project.id, { runState: 'RUN_ACTIVE', assignedAgentId: agent.id, archived: true })
    const outlook = await projectAutomationOutlook(project.id, NOW)
    expect(outlook.running).toEqual([{ taskId: first.id, key: `WEB-${first.number}`, title: 'Nav' }])
  })

  it('names what is stuck: queued with no agent, due with no agent, blocked for lost access, and a routine paused for a reason', async () => {
    const project = await privateProject({ key: 'WEB' })
    const person = await createUser()
    const queued = await taskIn(project.id, { runState: 'RUN_QUEUED', title: 'Queued' })
    const due = await taskIn(project.id, { runState: 'RUN_NONE', runStateReason: NO_AGENT_REASON, title: 'Due' })
    const blocked = await taskIn(project.id, { runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON, assignedAgentId: (await createAgent()).id, title: 'Blocked' })
    await taskIn(project.id, { runState: 'RUN_QUEUED', archived: true })
    const paused = await routineIn(project.id, person.id, { enabled: false, pausedReason: 'its person lost access', title: 'Audit' })
    const { stuck } = await projectAutomationOutlook(project.id, NOW)
    expect(stuck).toEqual([
      { kind: 'noAgent', taskId: queued.id, key: `WEB-${queued.number}`, title: 'Queued' },
      { kind: 'noAgent', taskId: due.id, key: `WEB-${due.number}`, title: 'Due' },
      { kind: 'lostAccess', taskId: blocked.id, key: `WEB-${blocked.number}`, title: 'Blocked' },
      { kind: 'routinePaused', routineId: paused.id, title: 'Audit', reason: 'its person lost access' },
    ])
  })

  it("lists each routine's next run and the start times set on tasks, in time order, and nothing of another project", async () => {
    const project = await privateProject({ key: 'WEB' })
    const other = await privateProject({ key: 'OTH' })
    const person = await createUser()
    const daily = await routineIn(project.id, person.id, { title: 'Daily site audit', nextRoundAt: new Date('2026-10-07T09:00:00Z') })
    await routineIn(project.id, person.id, { title: 'Switched off', enabled: false, nextRoundAt: new Date('2026-10-07T08:00:00Z') })
    await routineIn(other.id, person.id, { nextRoundAt: new Date('2026-10-07T08:00:00Z') })
    const sitemap = await taskIn(project.id, { title: 'Generate sitemap', scheduleNextDueAt: new Date('2026-10-06T14:30:00Z') })
    await taskIn(project.id, { title: 'Archived', archived: true, scheduleNextDueAt: new Date('2026-10-06T12:00:00Z') })
    await taskIn(other.id, { scheduleNextDueAt: new Date('2026-10-06T12:00:00Z') })
    const { later, laterMore } = await projectAutomationOutlook(project.id, NOW)
    expect(later).toEqual([
      { kind: 'task', at: '2026-10-06T14:30:00.000Z', taskId: sitemap.id, key: `WEB-${sitemap.number}`, title: 'Generate sitemap' },
      { kind: 'routine', at: '2026-10-07T09:00:00.000Z', routineId: daily.id, title: 'Daily site audit' },
    ])
    expect(laterMore).toBe(0)
  })

  it('refuses a project that does not exist', async () => {
    await expect(projectAutomationOutlook('00000000-0000-4000-8000-000000000000', NOW)).rejects.toMatchObject({ statusCode: 404 })
  })
})
