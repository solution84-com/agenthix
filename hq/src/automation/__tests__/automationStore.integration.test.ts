/**
 * A boundary's automation values and the pulse's stored due time against Postgres (adr-0088): every change to what
 * decides when a pulse is due recomputes the stored time and nothing else, and releasing throttled tasks starts them
 * at once. Calls that take a `now` get a fixed one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { agentQueuedCount, effectiveForProject, loadOrgAutomation, recomputePulseDueTimes, releaseThrottledWhereOff, saveProjectChoice } from '../automationStore'
import { setSchedulerWake } from '../schedulerNudge'
import { ORG_AUTOMATION_DEFAULTS } from '../automationSettings'
import { boardOf, taskIn } from './automationWorld'

const NOW = new Date('2026-10-03T10:00:00Z')
const choice = { enabled: true, intervalMinutes: null, batchSize: null, queueLimit: 4, agentSchedules: false, throttle: false, maxDepth: null }
const wake = vi.fn()

beforeEach(() => {
  wake.mockReset()
  socket.emitTaskUpdated.mockReset()
  setSchedulerWake(wake)
  return () => setSchedulerWake(null)
})

const automationOf = (projectId: string) => prisma.projectAutomation.findUnique({ where: { projectId } })
const stateOf = async (id: string) => (await prisma.task.findUnique({ where: { id } }))!.runState

describe('the queue limit counts what agents hold queued in the project', () => {
  it('counts queued and throttled tasks an agent queued, and nothing else', async () => {
    const project = await createProject()
    const other = await createProject()
    const agent = await prisma.agent.create({ data: { name: 'A', handle: 'a-store' } })
    await taskIn(project.id, { runState: 'RUN_QUEUED', queuedByAgentId: agent.id })
    await taskIn(project.id, { runState: 'RUN_THROTTLED', queuedByAgentId: agent.id })
    await taskIn(project.id, { runState: 'RUN_QUEUED', queuedByUserId: 'dana' })
    await taskIn(project.id, { runState: 'RUN_ACTIVE', queuedByAgentId: agent.id })
    await taskIn(other.id, { runState: 'RUN_QUEUED', queuedByAgentId: agent.id })
    expect(await agentQueuedCount(project.id)).toBe(2)
  })
})

describe('what a project is allowed', () => {
  it('is the stricter of the org\'s stored values and its own choice', async () => {
    const project = await createProject()
    expect(await loadOrgAutomation()).toEqual(ORG_AUTOMATION_DEFAULTS)
    await prisma.org.create({ data: { name: 'Org', automationBatchSize: 5, automationQueueLimit: 8 } })
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, batchSize: 2, queueLimit: 50 } })
    expect(await effectiveForProject(project.id)).toMatchObject({ enabled: true, batchSize: 2, queueLimit: 8 })
  })
})

describe('switching the throttle off', () => {
  it('lets the project\'s throttled tasks into their agents\' lines, and no other project\'s', async () => {
    const project = await createProject()
    const other = await createProject()
    const held = await taskIn(project.id, { runState: 'RUN_THROTTLED' })
    const elsewhere = await taskIn(other.id, { runState: 'RUN_THROTTLED' })
    await saveProjectChoice(project.id, choice, 'u1', NOW)
    expect(await stateOf(held.id)).toBe('RUN_QUEUED')
    expect(await stateOf(elsewhere.id)).toBe('RUN_THROTTLED')
  })

  it('switching it on leaves queued tasks as they are — they run as the batch already let through', async () => {
    const project = await createProject()
    const queued = await taskIn(project.id, { runState: 'RUN_QUEUED' })
    const held = await taskIn(project.id, { runState: 'RUN_THROTTLED' })
    await saveProjectChoice(project.id, { ...choice, throttle: true }, 'u1', NOW)
    expect([await stateOf(queued.id), await stateOf(held.id)]).toEqual(['RUN_QUEUED', 'RUN_THROTTLED'])
  })

  it('an org that stops requiring it releases every project that has not turned it on', async () => {
    const plain = await createProject()
    const noRow = await createProject()
    const choosing = await createProject()
    await prisma.projectAutomation.create({ data: { projectId: plain.id, enabled: true, throttle: false } })
    await prisma.projectAutomation.create({ data: { projectId: choosing.id, enabled: true, throttle: true } })
    const tasks = [await taskIn(plain.id, { runState: 'RUN_THROTTLED' }), await taskIn(noRow.id, { runState: 'RUN_THROTTLED' }), await taskIn(choosing.id, { runState: 'RUN_THROTTLED' })]
    expect(await releaseThrottledWhereOff({ ...ORG_AUTOMATION_DEFAULTS, throttle: true })).toBe(0)
    expect(await Promise.all(tasks.map(t => stateOf(t.id)))).toEqual(['RUN_THROTTLED', 'RUN_THROTTLED', 'RUN_THROTTLED'])
    expect(await releaseThrottledWhereOff(ORG_AUTOMATION_DEFAULTS)).toBe(2)
    expect(await Promise.all(tasks.map(t => stateOf(t.id)))).toEqual(['RUN_QUEUED', 'RUN_QUEUED', 'RUN_THROTTLED'])
  })
})

describe('the stored due time follows every change', () => {
  it('turning automation on in a quiet project makes its pulse due now, so queued work starts at once', async () => {
    const project = await createProject()
    await saveProjectChoice(project.id, choice, 'u1', NOW)
    expect(await automationOf(project.id)).toMatchObject({ enabled: true, queueLimit: 4, pulseDueAt: NOW, updatedById: 'u1' })
  })

  it('a longer interval moves the due time to that long after the last round finished', async () => {
    const project = await createProject()
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, lastRoundFinishedAt: new Date('2026-10-03T09:50:00Z') } })
    await saveProjectChoice(project.id, { ...choice, intervalMinutes: 60 }, 'u1', NOW)
    expect((await automationOf(project.id))!.pulseDueAt).toEqual(new Date('2026-10-03T10:50:00Z'))
  })

  it('leaves a round in progress alone — its end stores the next due time', async () => {
    const project = await createProject()
    const due = new Date('2026-10-03T11:30:00Z')
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, openRoundId: 'round-1', pulseDueAt: due } })
    await saveProjectChoice(project.id, { ...choice, intervalMinutes: 60 }, 'u1', NOW)
    expect(await automationOf(project.id)).toMatchObject({ openRoundId: 'round-1', pulseDueAt: due, intervalMinutes: 60 })
  })

  it('at boot and on an org change, recomputes from each stored round end — a restart neither resets the throttle nor fires everything', async () => {
    const idle = await createProject()
    const open = await createProject()
    const unchanged = await createProject()
    const openDue = new Date('2026-10-03T12:00:00Z')
    await prisma.projectAutomation.create({ data: { projectId: idle.id, enabled: true, lastRoundFinishedAt: new Date('2026-10-03T09:45:00Z') } })
    await prisma.projectAutomation.create({ data: { projectId: open.id, enabled: true, openRoundId: 'r0', pulseDueAt: openDue } })
    await prisma.projectAutomation.create({
      data: { projectId: unchanged.id, enabled: true, lastRoundFinishedAt: new Date('2026-10-03T09:45:00Z'), pulseDueAt: new Date('2026-10-03T10:15:00Z') },
    })
    expect(await recomputePulseDueTimes(NOW)).toBe(1)
    expect((await automationOf(idle.id))!.pulseDueAt).toEqual(new Date('2026-10-03T10:15:00Z'))
    expect((await automationOf(open.id))!.pulseDueAt).toEqual(openDue)
    expect((await automationOf(unchanged.id))!.pulseDueAt).toEqual(new Date('2026-10-03T10:15:00Z'))
  })

  it('a project that never had a round is due now', async () => {
    const project = await createProject()
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true } })
    await recomputePulseDueTimes(NOW)
    expect((await automationOf(project.id))!.pulseDueAt).toEqual(NOW)
  })
})

describe('releasing throttled tasks starts them at once', () => {
  it('nudges the scheduler and tells the boards they were on', async () => {
    const project = await createProject()
    const board = await boardOf(project.id)
    await taskIn(project.id, { runState: 'RUN_THROTTLED', boardId: board.id })
    await saveProjectChoice(project.id, choice, 'u1', NOW)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    expect(wake).toHaveBeenCalled()
  })

  it('the org turning the throttle off nudges too', async () => {
    const project = await createProject()
    const board = await boardOf(project.id)
    await taskIn(project.id, { runState: 'RUN_THROTTLED', boardId: board.id })
    await releaseThrottledWhereOff(ORG_AUTOMATION_DEFAULTS)
    expect(wake).toHaveBeenCalled()
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it('does neither when nothing was throttled', async () => {
    const project = await createProject()
    await taskIn(project.id, { runState: 'RUN_QUEUED' })
    await releaseThrottledWhereOff(ORG_AUTOMATION_DEFAULTS)
    expect(wake).not.toHaveBeenCalled()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })
})
