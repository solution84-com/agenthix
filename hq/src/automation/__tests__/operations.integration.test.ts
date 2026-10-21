/** The org's and a project's automation operations against Postgres (spec §2): the org's values are its admins', a project's choices are its project admins'. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { getOrgAutomation, updateOrgAutomation, getProjectAutomation, updateProjectAutomation } from '../operations'
import { setSchedulerWake } from '../schedulerNudge'
import { ORG_AUTOMATION_DEFAULTS, type OrgAutomation } from '../automationSettings'
import { addMember, boardOf, ctx, privateProject, refusedWith, taskIn } from './automationWorld'

const wake = vi.fn()
beforeEach(() => {
  wake.mockReset()
  socket.emitTaskUpdated.mockReset()
  setSchedulerWake(wake)
  return () => setSchedulerWake(null)
})

const ORG_VALUES: OrgAutomation = {
  allowed: true, intervalMinutes: 20, batchSize: 4, queueLimit: 10, agentSchedules: true, throttle: false, maxDepth: 2,
}
const FAR = () => new Date(Date.now() + 48 * 3_600_000)

describe('getOrgAutomation', () => {
  it('refuses nobody signed in', async () => {
    await refusedWith(getOrgAutomation(undefined, ctx()), 401)
  })

  it('answers the defaults before the org has any stored, and the stored values after', async () => {
    const viewer = await createUserWithRole('MEMBER')
    expect(await getOrgAutomation(undefined, ctx(viewer))).toEqual(ORG_AUTOMATION_DEFAULTS)
    await prisma.org.create({
      data: {
        name: 'Org', automationAllowed: false, automationIntervalMinutes: 45, automationBatchSize: 7, automationQueueLimit: 9,
        automationAgentSchedules: true, automationThrottle: true, automationMaxDepth: 5,
      },
    })
    expect(await getOrgAutomation(undefined, ctx(viewer))).toEqual({
      allowed: false, intervalMinutes: 45, batchSize: 7, queueLimit: 9, agentSchedules: true, throttle: true, maxDepth: 5,
    })
  })
})

describe('updateOrgAutomation', () => {
  it('refuses nobody signed in', async () => {
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx()), 401)
  })

  it.each(['MEMBER'] as const)('refuses a %s: it is the admins\' to change', async role => {
    const person = await createUserWithRole(role)
    await prisma.org.create({ data: { name: 'Org' } })
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(person)), 403)
    expect((await prisma.org.findFirst())!.automationIntervalMinutes).toBe(30)
  })

  it('refuses a person with no role at all', async () => {
    const person = await createUser()
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(person)), 403)
  })

  it.each([
    ['an interval under the floor', { intervalMinutes: 1 }],
    ['a batch size of none', { batchSize: 0 }],
    ['a switch that is not on or off', { throttle: 'yes' as unknown as boolean }],
  ])('refuses %s, changing nothing', async (_what, patch) => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org' } })
    await refusedWith(updateOrgAutomation({ ...ORG_VALUES, ...patch }, ctx(admin)), 400)
    expect((await prisma.org.findFirst())!.automationBatchSize).toBe(3)
  })

  it('is refused with a conflict until the organisation is set up', async () => {
    const admin = await createUserWithRole('ADMIN')
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(admin)), 409)
  })

  it('stores the values, answers them, and wakes the scheduler', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org' } })
    expect(await updateOrgAutomation({ ...ORG_VALUES, ignored: 'extra' } as OrgAutomation, ctx(admin))).toEqual(ORG_VALUES)
    expect(await getOrgAutomation(undefined, ctx(admin))).toEqual(ORG_VALUES)
    expect(wake).toHaveBeenCalled()
  })

  it('moves every idle project\'s next pulse to the new interval, and leaves a round in progress to finish', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org' } })
    const idle = await createProject()
    const open = await createProject()
    const finished = new Date(Math.floor((Date.now() - 3_600_000) / 60_000) * 60_000)
    const oldDue = new Date('2026-01-01T00:00:00Z')
    await prisma.projectAutomation.create({ data: { projectId: idle.id, enabled: true, lastRoundFinishedAt: finished, pulseDueAt: oldDue } })
    await prisma.projectAutomation.create({ data: { projectId: open.id, enabled: true, openRoundId: 'round-1', pulseDueAt: oldDue } })
    await updateOrgAutomation({ ...ORG_VALUES, intervalMinutes: 120 }, ctx(admin))
    const idleRow = await prisma.projectAutomation.findUnique({ where: { projectId: idle.id } })
    const openRow = await prisma.projectAutomation.findUnique({ where: { projectId: open.id } })
    expect(idleRow!.pulseDueAt).toEqual(new Date(finished.getTime() + 120 * 60_000))
    expect(openRow!.pulseDueAt).toEqual(oldDue)
  })

  it('with the throttle now off, releases the throttled tasks of every project that did not choose it, and tells their boards', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org', automationThrottle: true } })
    const plain = await createProject()
    const choosing = await createProject()
    const board = await boardOf(plain.id)
    await prisma.projectAutomation.create({ data: { projectId: choosing.id, enabled: true, throttle: true } })
    const held = await taskIn(plain.id, { runState: 'RUN_THROTTLED', boardId: board.id, assignedAgentId: null })
    const heldByChoice = await taskIn(choosing.id, { runState: 'RUN_THROTTLED' })
    await updateOrgAutomation({ ...ORG_VALUES, throttle: false }, ctx(admin))
    expect((await prisma.task.findUnique({ where: { id: held.id } }))!.runState).toBe('RUN_QUEUED')
    expect((await prisma.task.findUnique({ where: { id: heldByChoice.id } }))!.runState).toBe('RUN_THROTTLED')
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })
})

describe('getProjectAutomation', () => {
  it('refuses nobody signed in', async () => {
    const project = await createProject()
    await refusedWith(getProjectAutomation({ projectId: project.id }, ctx()), 401)
  })

  it('refuses someone outside a private project', async () => {
    const project = await privateProject()
    const outsider = await createUser()
    await refusedWith(getProjectAutomation({ projectId: project.id }, ctx(outsider)), 403)
  })

  it('answers the org\'s values, the project\'s choice and what it holds, for any member', async () => {
    const project = await privateProject()
    const member = await createUser()
    await addMember(project.id, member.id)
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, batchSize: 2, pulseDueAt: FAR() } })
    const agent = await prisma.agent.create({ data: { name: 'A', handle: 'a-1' } })
    await taskIn(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id, queuedByAgentId: agent.id })
    await taskIn(project.id, { runState: 'RUN_THROTTLED', assignedAgentId: agent.id, queuedByUserId: member.id })
    const status = await getProjectAutomation({ projectId: project.id }, ctx(member))
    expect(status).toMatchObject({
      org: ORG_AUTOMATION_DEFAULTS,
      choice: { enabled: true, batchSize: 2, throttle: false },
      effective: { enabled: true, batchSize: 2 },
      roundOpen: false, queued: 1, throttled: 1, agentHeld: 1, recent: [],
    })
    expect(status.nextPulseAt).not.toBeNull()
  })

  it('shows a project that chose nothing as automation off, with no next pulse', async () => {
    const project = await createProject()
    const person = await createUser()
    await addMember(project.id, person.id)
    const status = await getProjectAutomation({ projectId: project.id }, ctx(person))
    expect(status).toMatchObject({ choice: null, effective: { enabled: false }, nextPulseAt: null, queued: 0 })
  })
})

describe('updateProjectAutomation', () => {
  const CHOICE = { enabled: true, intervalMinutes: 60, batchSize: 2, queueLimit: null, agentSchedules: false, throttle: true, maxDepth: 1 }

  it('refuses nobody signed in', async () => {
    const project = await createProject()
    await refusedWith(updateProjectAutomation({ projectId: project.id, ...CHOICE }, ctx()), 401)
  })

  it('refuses a plain member, and an org admin who is not on the project: it is the project admins\' to change', async () => {
    const project = await createProject()
    const member = await createUser()
    const orgAdmin = await createUserWithRole('ADMIN')
    await addMember(project.id, member.id)
    await refusedWith(updateProjectAutomation({ projectId: project.id, ...CHOICE }, ctx(member)), 403)
    await refusedWith(updateProjectAutomation({ projectId: project.id, ...CHOICE }, ctx(orgAdmin)), 403)
    expect(await prisma.projectAutomation.count()).toBe(0)
  })

  it.each([
    ['an interval under the org\'s', { intervalMinutes: 10 }],
    ['a batch size over the org\'s', { batchSize: 50 }],
    ['agent schedules the org does not allow', { agentSchedules: true }],
  ])('refuses %s, storing nothing', async (_what, patch) => {
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    await refusedWith(updateProjectAutomation({ projectId: project.id, ...CHOICE, ...patch }, ctx(admin)), 400)
    expect(await prisma.projectAutomation.count()).toBe(0)
  })

  it('refuses turning automation on while the org has it off', async () => {
    await prisma.org.create({ data: { name: 'Org', automationAllowed: false } })
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    await refusedWith(updateProjectAutomation({ projectId: project.id, ...CHOICE }, ctx(admin)), 400)
  })

  it('stores the choice with who made it, answers the project\'s status, and wakes the scheduler', async () => {
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    const status = await updateProjectAutomation({ projectId: project.id, ...CHOICE }, ctx(admin))
    expect(status).toMatchObject({ choice: CHOICE, effective: { enabled: true, intervalMinutes: 60, throttle: true }, roundOpen: false })
    expect(await prisma.projectAutomation.findUnique({ where: { projectId: project.id } })).toMatchObject({
      enabled: true, intervalMinutes: 60, batchSize: 2, throttle: true, maxDepth: 1, updatedById: admin.id,
    })
    expect(wake).toHaveBeenCalled()
  })

  it('treats a value left out as the org\'s, and switching the throttle off releases the project\'s throttled tasks', async () => {
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, throttle: true } })
    const held = await taskIn(project.id, { runState: 'RUN_THROTTLED', assignedAgentId: null })
    const status = await updateProjectAutomation({ projectId: project.id, enabled: true, agentSchedules: false, throttle: false } as any, ctx(admin))
    expect(status.choice).toEqual({ enabled: true, intervalMinutes: null, batchSize: null, queueLimit: null, agentSchedules: false, throttle: false, maxDepth: null })
    expect((await prisma.task.findUnique({ where: { id: held.id } }))!.runState).toBe('RUN_QUEUED')
  })
})
