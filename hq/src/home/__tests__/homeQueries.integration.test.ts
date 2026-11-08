/**
 * Home (every screen reviewed spec §8), against the real test database: the
 * signal counts hold only what is the caller's own or acts on their behalf.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { createAgent, createProject, createSession, createUser, createTestTask, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { getHomeSignals } from '../homeSignals'

const ctx = (user: { id: string } | undefined) => ({ user, entities: {} }) as any

const NOW = Date.now()
const inMinutes = (m: number) => new Date(NOW + m * 60_000)
const END_OF_DAY = inMinutes(120).toISOString()

let taskNumber = 0
function task(projectId: string, data: Record<string, unknown>) {
  return createTestTask({ data: { title: 'A task', projectId, number: ++taskNumber, ...data } as any })
}

function routine(projectId: string, data: Record<string, unknown>) {
  return prisma.routine.create({
    data: {
      projectId, title: 'Daily audit', cron: '0 9 * * *', timezone: 'UTC', ...data,
    } as any,
  })
}

describe('getHomeSignals @SC-509 @SC-526', () => {
  it('refuses a caller who is not signed in', async () => {
    await expect(getHomeSignals({ until: END_OF_DAY }, ctx(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })

  it("counts the caller's notifications that need them, seen or not, and none handled, dismissed or someone else's", async () => {
    const me = await createUser()
    const other = await createUser()
    const note = (userId: string, status: string) =>
      prisma.notification.create({ data: { userId, type: 'task_waiting', title: 't', body: 'b', status } })
    await note(me.id, 'unread')
    await note(me.id, 'unread')
    await note(me.id, 'read')
    await note(me.id, 'handled')
    await note(me.id, 'dismissed')
    await note(other.id, 'unread')

    const signals = await getHomeSignals({ until: END_OF_DAY }, ctx(me))

    expect(signals.notificationsNeedingYou).toBe(3)
  })

  it("counts the caller's runs going now — started by them or on their behalf — as the Runs button does", async () => {
    // The runs are read from every registered site, so the site the fake holds them on is registered.
    await ensureExecutionSite({ siteId: 'site-1', protocolVersion: SITE_PROTOCOL_VERSION })
    const me = await createUser()
    const other = await createUser()
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    const agent = await createAgent({ name: 'Frontend' })
    let run = 0
    const going = async (data: Record<string, unknown>, status = 'RUNNING') => {
      const t = await task(project.id, { runState: 'RUN_ACTIVE', assignedAgentId: agent.id, ...data })
      const session = await createSession({ userId: me.id, agentId: agent.id, sessionType: 'task', taskId: t.id })
      siteStore.addRun('site-1', { id: `home-r${++run}`, sessionId: session.id, agentId: agent.id, status: status as never })
    }
    await going({ onBehalfOfUserId: me.id })
    await going({ onBehalfOfUserId: other.id, queuedByUserId: me.id })
    await going({ onBehalfOfUserId: other.id })
    await going({ onBehalfOfUserId: me.id }, 'COMPLETED')
    await going({ onBehalfOfUserId: me.id, archived: true })

    const signals = await getHomeSignals({ until: END_OF_DAY }, ctx(me))

    expect(signals.agentsAtWork).toBe(2)
  })

  it('leaves out work in a project the caller can no longer see', async () => {
    const me = await createUser()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    const agent = await createAgent()
    await task(hidden.id, { runState: 'RUN_ACTIVE', assignedAgentId: agent.id, onBehalfOfUserId: me.id })
    await routine(hidden.id, { onBehalfOfUserId: me.id, nextDueAt: inMinutes(30) })

    const signals = await getHomeSignals({ until: END_OF_DAY }, ctx(me))

    expect(signals).toMatchObject({ agentsAtWork: 0, comingUpToday: 0 })
  })

  it("counts the caller's routine firings and scheduled tasks due from now until the end of their day", async () => {
    const me = await createUser()
    const other = await createUser()
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    await routine(project.id, { onBehalfOfUserId: me.id, nextDueAt: inMinutes(30) })
    await routine(project.id, { onBehalfOfUserId: me.id, nextDueAt: inMinutes(60 * 5) })
    await routine(project.id, { onBehalfOfUserId: me.id, nextDueAt: inMinutes(30), enabled: false })
    await routine(project.id, { onBehalfOfUserId: me.id, nextDueAt: null })
    await routine(project.id, { onBehalfOfUserId: other.id, nextDueAt: inMinutes(30) })
    await task(project.id, { onBehalfOfUserId: me.id, scheduleNextDueAt: inMinutes(90) })
    await task(project.id, { onBehalfOfUserId: me.id, scheduleNextDueAt: inMinutes(-10) })
    await task(project.id, { onBehalfOfUserId: me.id, scheduleNextDueAt: inMinutes(90), archived: true })
    await task(project.id, { onBehalfOfUserId: other.id, scheduleNextDueAt: inMinutes(90) })

    const signals = await getHomeSignals({ until: END_OF_DAY }, ctx(me))

    expect(signals.comingUpToday).toBe(2)
  })

  it('refuses an end of day that is not a time, and never looks further than a day ahead', async () => {
    const me = await createUser()
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: me.id } })
    await routine(project.id, { onBehalfOfUserId: me.id, nextDueAt: inMinutes(60 * 30) })

    await expect(getHomeSignals({ until: 'tonight' }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    const signals = await getHomeSignals({ until: inMinutes(60 * 24 * 7).toISOString() }, ctx(me))
    expect(signals.comingUpToday).toBe(0)
  })
})
