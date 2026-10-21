/** Reading routines against Postgres (spec §3): a project's list, and one routine's page. Only a member of the project can read them. */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getProjectRoutines, getRoutine } from '../routineQueries'
import { DAILY, addMember, boardOf, ctx, privateProject, refusedWith, routineIn, taskIn } from './automationWorld'

const MISSING = '00000000-0000-4000-8000-000000000000'
const DAY = 24 * 3_600_000

function namedUser(username: string) {
  return createUser({ auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } } } })
}

describe('getProjectRoutines @SC-686', () => {
  it('refuses nobody signed in, and someone outside a private project', async () => {
    const project = await privateProject()
    const outsider = await createUser()
    await refusedWith(getProjectRoutines({ projectId: project.id }, ctx()), 401)
    await refusedWith(getProjectRoutines({ projectId: project.id }, ctx(outsider)), 403)
  })

  it('answers an empty list for a project with none, and never another project\'s routines', async () => {
    const project = await createProject()
    const elsewhere = await createProject()
    const person = await createUser()
    await addMember(project.id, person.id)
    await routineIn(elsewhere.id, person.id)
    expect(await getProjectRoutines({ projectId: project.id }, ctx(person))).toEqual([])
  })

  it('lists them oldest first, each with its repeat, person, agent, place and next round', async () => {
    const project = await privateProject()
    const dana = await namedUser('dana')
    const reader = await namedUser('reader')
    await addMember(project.id, dana.id)
    await addMember(project.id, reader.id)
    const agent = await createAgent({ name: 'Xavier' })
    const board = await boardOf(project.id)
    const next = new Date(Date.now() + DAY)
    const first = await routineIn(project.id, dana.id, { title: 'First', assignedAgentId: agent.id, boardId: board.id, column: 'ready', nextRoundAt: next })
    const second = await routineIn(project.id, dana.id, { title: 'Second', enabled: false, pausedReason: 'paused for a reason', nextRoundAt: next })
    await prisma.routine.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() + 1000) } })
    const list = await getProjectRoutines({ projectId: project.id }, ctx(reader))
    expect(list.map(r => r.id)).toEqual([first.id, second.id])
    expect(list[0]).toMatchObject({
      title: 'First', rule: DAILY, timezone: 'UTC', enabled: true, pausedReason: null, nextRoundAt: next.toISOString(),
      onBehalfOf: { userId: dana.id, username: 'dana' }, agentName: 'Xavier', place: 'Board 0 › Ready', canManage: false,
    })
    expect(list[1]).toMatchObject({ enabled: false, pausedReason: 'paused for a reason', nextRoundAt: null, agentName: null, place: 'Project Tasks › Backlog' })
    expect(list.map(r => r.lastRounds)).toEqual([[], []])
  })

  it("gives each routine its last rounds' states, oldest first", async () => {
    const project = await createProject()
    const dana = await createUser()
    await addMember(project.id, dana.id)
    const routine = await routineIn(project.id, dana.id)
    const now = Date.now()
    await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now - 2 * DAY), runState: 'RUN_FAILED' })
    await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now - DAY), status: 'DONE' })
    await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now + DAY) })
    const [listed] = await getProjectRoutines({ projectId: project.id }, ctx(dana))
    expect(listed.lastRounds).toEqual(['failed', 'done', 'waiting'])
  })

  it('says a routine can be managed by its person and by a project admin, and by no other member', async () => {
    const project = await privateProject()
    const dana = await createUser()
    const admin = await createUser()
    const other = await createUser()
    await addMember(project.id, dana.id)
    await addMember(project.id, admin.id, 'ADMIN')
    await addMember(project.id, other.id)
    await routineIn(project.id, dana.id)
    const canManage = async (u: { id: string }) => (await getProjectRoutines({ projectId: project.id }, ctx(u)))[0].canManage
    expect([await canManage(dana), await canManage(admin), await canManage(other)]).toEqual([true, true, false])
  })

  it("names a person whose account has gone as no one, and a board that has gone as Project Tasks' Backlog", async () => {
    const project = await createProject()
    const reader = await createUser()
    await addMember(project.id, reader.id)
    await routineIn(project.id, MISSING, { boardId: MISSING, column: 'ready' })
    const [routine] = await getProjectRoutines({ projectId: project.id }, ctx(reader))
    expect(routine).toMatchObject({ onBehalfOf: { userId: MISSING, username: 'Former member' }, place: 'Project Tasks › Backlog' })
  })
})

describe('getRoutine @SC-684', () => {
  it('refuses nobody signed in, an unknown routine, and someone outside its private project', async () => {
    const project = await privateProject()
    const person = await createUser()
    const outsider = await createUser()
    const routine = await routineIn(project.id, person.id)
    await refusedWith(getRoutine({ routineId: routine.id }, ctx()), 401)
    await refusedWith(getRoutine({ routineId: MISSING }, ctx(person)), 404)
    await refusedWith(getRoutine({ routineId: routine.id }, ctx(outsider)), 403)
  })

  it('answers its template, schedule and project, with every round newest first, each noted as waiting or not', async () => {
    const project = await privateProject({ key: 'RTN' })
    const dana = await namedUser('dana')
    await addMember(project.id, dana.id)
    const agent = await createAgent()
    const routine = await routineIn(project.id, dana.id, {
      description: 'Look at the board', priority: 'HIGH', labels: ['ops', 7], assignedAgentId: agent.id, createdByUserId: dana.id,
    })
    const now = Date.now()
    const old = await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now - 2 * DAY), runState: 'RUN_NONE', status: 'DONE' })
    const waiting = await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now + DAY) })
    const recent = await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now - DAY), runState: 'RUN_ACTIVE' })
    const detail = await getRoutine({ routineId: routine.id }, ctx(dana))
    expect(detail).toMatchObject({
      id: routine.id, projectId: project.id, projectKey: 'RTN', title: 'Board review', description: 'Look at the board', priority: 'HIGH',
      labels: ['ops'], assignedAgentId: agent.id, boardId: null, column: null, scheduleAt: '2026-10-01T09:00:00.000Z',
      createdBy: 'dana', onBehalfOfHasAccess: true, canManage: true, rule: DAILY,
    })
    expect(detail.rounds.map(r => [r.id, r.key, r.waiting])).toEqual([
      [waiting.id, `RTN-${waiting.number}`, true],
      [recent.id, `RTN-${recent.number}`, false],
      [old.id, `RTN-${old.number}`, false],
    ])
    expect(detail.rounds[1]).toMatchObject({ runState: 'RUN_ACTIVE', archived: false, roundAt: new Date(now - DAY).toISOString() })
    expect(detail.rounds.map(r => r.state)).toEqual(['waiting', 'running', 'done'])
    expect(detail).toMatchObject({ isPersonal: false, moreRounds: false, lastRounds: ['done', 'running', 'waiting'] })
    expect(detail.rounds.every(r => r.tookMs === null)).toBe(true)
  })

  it('reads the last 10 rounds by default, says there are older ones, and reads more when asked', async () => {
    const project = await createProject()
    const dana = await createUser()
    await addMember(project.id, dana.id)
    const routine = await routineIn(project.id, dana.id)
    const now = Date.now()
    for (let i = 1; i <= 12; i++) {
      await taskIn(project.id, { routineId: routine.id, roundAt: new Date(now - i * DAY), runState: i % 3 === 0 ? 'RUN_FAILED' : 'RUN_NONE', status: 'DONE' })
    }
    const first = await getRoutine({ routineId: routine.id }, ctx(dana))
    expect(first.rounds).toHaveLength(10)
    expect(first.moreRounds).toBe(true)
    expect(first.lastRounds).toHaveLength(10)
    const more = await getRoutine({ routineId: routine.id, rounds: 30 }, ctx(dana))
    expect(more.rounds).toHaveLength(12)
    expect(more.moreRounds).toBe(false)
  })

  it('says when its project is the person\'s own Chat', async () => {
    const dana = await createUser()
    const chat = await createProject({ personalOwnerId: dana.id })
    const routine = await routineIn(chat.id, dana.id)
    expect((await getRoutine({ routineId: routine.id }, ctx(dana))).isPersonal).toBe(true)
  })

  it('credits an agent that set it up, and says unknown when nobody is recorded', async () => {
    const project = await createProject()
    const dana = await namedUser('dana')
    await addMember(project.id, dana.id)
    const agent = await createAgent({ name: 'Xavier' })
    const byAgent = await routineIn(project.id, dana.id, { createdByUserId: dana.id, createdByAgentId: agent.id })
    const byNobody = await routineIn(project.id, dana.id)
    expect((await getRoutine({ routineId: byAgent.id }, ctx(dana))).createdBy).toBe('Xavier, when dana asked')
    expect((await getRoutine({ routineId: byNobody.id }, ctx(dana))).createdBy).toBe('unknown')
  })

  it('tells a project admin the people it may be handed to, and a plain member none', async () => {
    const project = await privateProject()
    const dana = await namedUser('dana')
    const admin = await namedUser('admin')
    await addMember(project.id, dana.id)
    await addMember(project.id, admin.id, 'ADMIN')
    const routine = await routineIn(project.id, dana.id)
    const asAdmin = await getRoutine({ routineId: routine.id }, ctx(admin))
    expect(asAdmin.isProjectAdmin).toBe(true)
    expect(asAdmin.candidates).toEqual([{ userId: admin.id, username: 'admin' }, { userId: dana.id, username: 'dana' }])
    const asMember = await getRoutine({ routineId: routine.id }, ctx(dana))
    expect(asMember).toMatchObject({ isProjectAdmin: false, candidates: [] })
  })

  it('says whether the routine\'s person can still reach the project', async () => {
    const project = await privateProject()
    const dana = await createUser()
    const reader = await createUser()
    await addMember(project.id, reader.id)
    const routine = await routineIn(project.id, dana.id)
    expect((await getRoutine({ routineId: routine.id }, ctx(reader))).onBehalfOfHasAccess).toBe(false)
    await addMember(project.id, dana.id)
    expect((await getRoutine({ routineId: routine.id }, ctx(reader))).onBehalfOfHasAccess).toBe(true)
  })
})
