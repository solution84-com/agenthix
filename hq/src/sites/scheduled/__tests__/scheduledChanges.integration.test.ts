import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUser, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import type { ScheduledChangeNotice } from '@agenthix/core'
import { cancelRun, cancelledRuns } from '../../../test/fakes/siteRuntimeStore'
import { startedTasks } from '../../../test/fakes/TaskRunner'
import { recordScheduledChangeNotice, SCHEDULED_CHANGE_NOTIFICATION, sweepScheduledChanges } from '../scheduledChanges'
import { scheduledChangeHold } from '../runHold'
import { SCHEDULED_CHANGE_REASON_PREFIX } from '../noticeWords'

let seq = 0
const uniq = (p: string) => `${p}-${++seq}-${Date.now()}`

async function siteWithMember() {
  const site = await prisma.executionSite.create({ data: { siteId: uniq('site'), label: uniq('office-server') } })
  const project = await createProject({ name: uniq('Robot arm firmware'), executionSiteId: site.id })
  const member = await createUser()
  await joinProjectAs(project.id, member.id)
  return { site, project, member }
}

function notice(update: ScheduledChangeNotice['update'], sentAt: string, over: Partial<ScheduledChangeNotice['change']> = {}): ScheduledChangeNotice {
  return {
    update,
    change: {
      id: '7', kind: 'upgrade', target: 'site', siteName: 'whatever-it-says', machine: { name: 'office-server', fingerprint: 'f'.repeat(64) },
      at: '2026-10-18T02:00:00.000Z', scheduledBy: { kind: 'fleetAdmin', userId: 'u', name: 'Sam Rivera' }, scheduledAt: '2026-10-14T09:00:00.000Z',
      state: update === 'pausing' ? 'pausing' : update === 'completed' ? 'done' : 'scheduled', detail: '0.2.1', expectedMinutes: 20,
      ...over,
    },
    sentAt,
    reason: null,
  }
}

const notifications = (userId: string) =>
  prisma.notification.findMany({ where: { userId, type: SCHEDULED_CHANGE_NOTIFICATION }, orderBy: { createdAt: 'asc' } })

beforeEach(() => {
  cancelledRuns.length = 0
  startedTasks.length = 0
})

describe('a scheduled change hq hears of @SC-931', () => {
  it('tells the members whose work runs on the site, and no one else, without naming who scheduled it', async () => {
    const { site, member } = await siteWithMember()
    const other = await siteWithMember()
    expect(await recordScheduledChangeNotice(notice('scheduled', '2026-10-14T09:00:00.000Z'), { from: 'site', siteId: site.siteId })).toBe(true)
    const told = await notifications(member.id)
    expect(told).toHaveLength(1)
    expect(told[0].title).toBe('Scheduled maintenance')
    expect(told[0].body).toContain(`${site.label}, where your work runs, is upgraded to 0.2.1`)
    expect(told[0].body).not.toContain('Sam Rivera')
    expect(await notifications(other.member.id)).toHaveLength(0)
  })

  it('keeps the newest notice, and an updated one replaces what members were told', async () => {
    const { site, member } = await siteWithMember()
    const from = { from: 'site' as const, siteId: site.siteId }
    await recordScheduledChangeNotice(notice('scheduled', '2026-10-14T09:00:00.000Z'), from)
    expect(await recordScheduledChangeNotice(notice('changed', '2026-10-14T10:00:00.000Z', { at: '2026-10-19T02:00:00.000Z' }), from)).toBe(true)
    expect(await recordScheduledChangeNotice(notice('cancelled', '2026-10-14T08:00:00.000Z'), from)).toBe(false)
    const told = await notifications(member.id)
    expect(told.map(n => [n.title, n.status])).toEqual([['Scheduled maintenance', 'handled'], ['Scheduled maintenance moved', 'unread']])
    await recordScheduledChangeNotice(notice('cancelled', '2026-10-14T11:00:00.000Z', { at: '2026-10-19T02:00:00.000Z' }), from)
    expect((await notifications(member.id)).at(-1)?.title).toBe('Scheduled maintenance cancelled')
  })

  it('holds a site’s notice to that site, whatever target it claims', async () => {
    const { site } = await siteWithMember()
    await recordScheduledChangeNotice(notice('pausing', '2026-10-18T01:55:00.000Z', { id: '8', target: 'hq' }), { from: 'site', siteId: site.siteId })
    const row = await prisma.scheduledChange.findUnique({ where: { source_changeId: { source: `site:${site.siteId}`, changeId: '8' } } })
    expect(row?.siteId).toBe(site.siteId)
    const elsewhere = await siteWithMember()
    expect(await scheduledChangeHold(elsewhere.site.siteId, new Date('2026-10-18T01:56:00Z'))).toBeNull()
  })
})

describe('runs around a scheduled change @SC-932', () => {
  it('starts none and pauses the ones going from its lead, and lets them carry on after it', async () => {
    const { site, project, member } = await siteWithMember()
    const agent = await createAgent()
    const going = await createTestTask({ data: { title: 'Calibrate gripper', projectId: project.id, number: ++seq, assignedAgentId: agent.id, runState: 'RUN_ACTIVE', runId: 'run-1', runStartedBy: 'person', onBehalfOfUserId: member.id } })
    const from = { from: 'site' as const, siteId: site.siteId }

    await recordScheduledChangeNotice(notice('scheduled', '2026-10-14T09:00:00.000Z', { id: '9' }), from)
    expect(await scheduledChangeHold(site.siteId, new Date('2026-10-18T01:50:00Z'))).toBeNull()
    expect((await scheduledChangeHold(site.siteId, new Date('2026-10-18T01:56:00Z')))?.reason).toMatch(/^Paused for scheduled maintenance: the upgrade of /)

    // The site cannot be asked to pause at the end of the step (runPause.integration.test.ts covers that), so the run
    // is stopped at once and its task waits for the change.
    cancelRun.mockRejectedValueOnce(new Error('unknown reason'))
    await recordScheduledChangeNotice(notice('pausing', '2026-10-18T01:55:00.000Z', { id: '9' }), from)
    const paused = await prisma.task.findUniqueOrThrow({ where: { id: going.id } })
    expect(paused).toMatchObject({ runState: 'RUN_QUEUED', runId: null })
    expect(paused.runStateReason?.startsWith(SCHEDULED_CHANGE_REASON_PREFIX)).toBe(true)
    expect(cancelledRuns).toEqual([expect.objectContaining({ siteId: site.siteId, runId: 'run-1' })])

    await recordScheduledChangeNotice(notice('completed', '2026-10-18T02:18:00.000Z', { id: '9' }), from)
    expect(startedTasks.map(t => t.taskId)).toEqual([going.id])
    expect(await scheduledChangeHold(site.siteId, new Date('2026-10-18T02:19:00Z'))).toBeNull()
  })

  it('lets them go by hq’s own clock when the end of a change never arrives', async () => {
    const { site, project, member } = await siteWithMember()
    const agent = await createAgent()
    const waiting = await createTestTask({ data: { title: 'Retrain', projectId: project.id, number: ++seq, assignedAgentId: agent.id, runState: 'RUN_ACTIVE', runId: 'run-2', onBehalfOfUserId: member.id } })
    cancelRun.mockRejectedValueOnce(new Error('unknown reason'))
    await recordScheduledChangeNotice(notice('pausing', '2026-10-18T01:55:00.000Z', { id: '10' }), { from: 'site', siteId: site.siteId })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: waiting.id } })).runState).toBe('RUN_QUEUED')
    await sweepScheduledChanges(new Date('2026-10-18T05:00:00Z'))
    expect(startedTasks.map(t => t.taskId)).toContain(waiting.id)
  })
})
