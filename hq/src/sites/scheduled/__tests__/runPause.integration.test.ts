/**
 * Runs paused at the end of a step around a scheduled change (host-management spec §14), against the real database.
 * A site is asked to pause each task run going: the task stays running, saying it is pausing, until the run's end
 * arrives. A site that refuses has the run stopped at once and its task put back to wait. Either way the task's conversation is marked so the run after carries on where it stopped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUser, joinProjectAs } from '../../../test/factories'

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
import { cancelledRuns, cancelRun } from '../../../test/fakes/siteRuntimeStore'
import { recordScheduledChangeNotice } from '../scheduledChanges'
import { SCHEDULED_CHANGE_REASON_PREFIX } from '../noticeWords'

let seq = 0
const uniq = (p: string) => `${p}-${++seq}-${Date.now()}`

async function runningTask(protocolVersion: string | null) {
  const site = await prisma.executionSite.create({ data: { siteId: uniq('site'), label: uniq('office-server'), protocolVersion } })
  const project = await createProject({ name: uniq('Robot arm firmware'), executionSiteId: site.id })
  const member = await createUser()
  await joinProjectAs(project.id, member.id)
  const agent = await createAgent()
  const runId = uniq('run')
  const task = await createTestTask({ data: { title: 'Calibrate gripper', projectId: project.id, number: ++seq, assignedAgentId: agent.id, runState: 'RUN_ACTIVE', runId, runStartedBy: 'person', onBehalfOfUserId: member.id } })
  const session = await createSession({ agentId: agent.id, taskId: task.id, sessionType: 'task', metadata: { agentId: agent.id } })
  return { site, task, runId, session }
}

function pausing(id: string): ScheduledChangeNotice {
  return {
    update: 'pausing',
    change: {
      id, kind: 'upgrade', target: 'site', siteName: 'office-server', machine: { name: 'office-server', fingerprint: 'f'.repeat(64) },
      at: '2026-10-18T02:00:00.000Z', scheduledBy: { kind: 'fleetAdmin', userId: 'u', name: 'Sam Rivera' }, scheduledAt: '2026-10-14T09:00:00.000Z',
      state: 'pausing', detail: '0.2.1', expectedMinutes: 20,
    },
    sentAt: '2026-10-18T01:55:00.000Z',
    reason: null,
  }
}

const marked = async (sessionId: string) =>
  ((await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } })).metadata as Record<string, unknown>).pausedForScheduledChange === true

beforeEach(() => {
  cancelledRuns.length = 0
})

describe('task runs around a scheduled change @SC-932', () => {
  it('asks the site to pause each at the end of its step, and leaves the task running, saying so, until it has', async () => {
    const { site, task, runId, session } = await runningTask('1.0')
    await recordScheduledChangeNotice(pausing(uniq('c')), { from: 'site', siteId: site.siteId })

    expect(cancelledRuns).toEqual([{ siteId: site.siteId, runId, reason: 'paused', by: `the scheduled upgrade of ${site.label}` }])
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(row).toMatchObject({ runState: 'RUN_ACTIVE', runId })
    expect(row.runStateReason).toBe(`Pausing for the scheduled upgrade of ${site.label}: it stops at the end of its current step, and carries on by itself when that is done.`)
    // Marked only once the run has paused (taskStatusListener.ts): it may yet finish on its own.
    expect(await marked(session.id)).toBe(false)
  })

  it('stops the run at once when the site cannot be asked to pause it', async () => {
    const { site, task, runId, session } = await runningTask('1.0')
    cancelRun.mockRejectedValueOnce(new Error('unknown reason'))
    await recordScheduledChangeNotice(pausing(uniq('c')), { from: 'site', siteId: site.siteId })

    expect(cancelledRuns).toEqual([{ siteId: site.siteId, runId, by: `the scheduled upgrade of ${site.label}` }])
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ runState: 'RUN_QUEUED', runId: null })
    expect(await marked(session.id)).toBe(true)
  })
})
