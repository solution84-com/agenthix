import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../test/factories'

// SC-097 create / edit / delete teams of people and agents · SC-098 view all
// teams · SC-213 deleting a team removes only the team · SC-310 role floors.
// Against the real test database. A team in projects: teamMembership.integration.test.ts.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { isOnline: () => false, request: vi.fn() } }))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createTeam, updateTeam, deleteTeam } from '../teams/teamActions'
import { getTeam, getTeams } from '../teams/teamQueries'

const ctx = (user?: { id: string }) => ({ user }) as any
const membersOf = async (teamId: string) => {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId }, include: { people: true, agents: true } })
  return { userIds: team.people.map(p => p.userId).sort(), agentIds: team.agents.map(a => a.agentId).sort() }
}

describe('createTeam @SC-097 @SC-670', () => {
  it('creates a team of people and agents with a name and purpose', async () => {
    const admin = await createUserWithRole('ADMIN')
    const dana = await createUser()
    const writer = await createAgent()
    const { id } = await createTeam({ name: ' Marketing ', purpose: 'Launches', userIds: [dana.id], agentIds: [writer.id] }, ctx(admin))
    expect(await prisma.team.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: 'Marketing', purpose: 'Launches', createdBy: admin.id })
    expect(await membersOf(id)).toEqual({ userIds: [dana.id], agentIds: [writer.id] })
  })

  it('refuses a team with no name, someone who has left, and an agent that does not exist', async () => {
    const admin = await createUserWithRole('ADMIN')
    const left = await createUser({ deactivatedAt: new Date() })
    await expect(createTeam({ name: '  ' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createTeam({ name: 'T', userIds: [left.id] }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createTeam({ name: 'T', agentIds: ['missing'] }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.team.count()).toBe(0)
  })
})

describe('updateTeam @SC-097 @SC-670', () => {
  it('changes its name and purpose, and replaces who is in it when given', async () => {
    const admin = await createUserWithRole('ADMIN')
    const [dana, lee] = [await createUser(), await createUser()]
    const writer = await createAgent()
    const { id } = await createTeam({ name: 'Eng', userIds: [dana.id], agentIds: [writer.id] }, ctx(admin))

    await updateTeam({ id, name: 'Engineering', purpose: 'Build' }, ctx(admin))
    expect(await membersOf(id)).toEqual({ userIds: [dana.id], agentIds: [writer.id] })

    await updateTeam({ id, userIds: [lee.id], agentIds: [] }, ctx(admin))
    expect(await prisma.team.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: 'Engineering', purpose: 'Build' })
    expect(await membersOf(id)).toEqual({ userIds: [lee.id], agentIds: [] })
  })

  it('answers 404 for a team that does not exist', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(updateTeam({ id: 'missing', name: 'x' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deleteTeam @SC-213 @SC-670', () => {
  it('deletes the team; its people and agents stay', async () => {
    const admin = await createUserWithRole('ADMIN')
    const dana = await createUser()
    const agent = await createAgent()
    const { id } = await createTeam({ name: 'Eng', userIds: [dana.id], agentIds: [agent.id] }, ctx(admin))

    await deleteTeam({ id }, ctx(admin))

    expect(await prisma.team.findUnique({ where: { id } })).toBeNull()
    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).not.toBeNull()
    expect(await prisma.user.findUnique({ where: { id: dana.id } })).not.toBeNull()
  })
})

describe('team role floors @SC-310 @SC-670', () => {
  it('refuses a caller who is not signed in (401) and changes nothing', async () => {
    await expect(createTeam({ name: 'x' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.team.count()).toBe(0)
  })

  it('refuses a MEMBER with 403 on create, update and delete, and changes nothing', async () => {
    const caller = await createUserWithRole('MEMBER')
    const team = await prisma.team.create({ data: { name: 'Eng', purpose: 'Build' } })

    await expect(createTeam({ name: 'x' }, ctx(caller))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateTeam({ id: team.id, name: 'x' }, ctx(caller))).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteTeam({ id: team.id }, ctx(caller))).rejects.toMatchObject({ statusCode: 403 })

    expect(await prisma.team.findMany()).toEqual([expect.objectContaining({ id: team.id, name: 'Eng' })])
  })

  it('refuses a person with no settings row (no role at all)', async () => {
    const nobody = await createUser()
    await expect(createTeam({ name: 'x' }, ctx(nobody))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('getTeams and getTeam @SC-098 @SC-669', () => {
  it('lists every team, oldest first, with its people, agents and how many projects it is in, to anyone signed in', async () => {
    const viewer = await createUserWithRole('MEMBER')
    const dana = await createUser({ displayName: 'Dana Kim' })
    const first = await prisma.team.create({ data: { name: 'A', createdAt: new Date('2026-01-01'), people: { create: [{ userId: dana.id }] } } })
    const second = await prisma.team.create({ data: { name: 'B', createdAt: new Date('2026-02-01') } })

    const teams = await getTeams(undefined, ctx(viewer))

    expect(teams.map(t => t.id)).toEqual([first.id, second.id])
    expect(teams[0]).toMatchObject({ userIds: [dana.id], people: [expect.objectContaining({ name: 'Dana Kim' })], projectCount: 0 })
  })

  it('names only the projects the reader can see, and counts the rest', async () => {
    const viewer = await createUserWithRole('MEMBER')
    const seen = await createProject({ accessLevel: 'OPEN', name: 'Website' })
    const hidden = await createProject({ accessLevel: 'PRIVATE', name: 'Secret' })
    const team = await prisma.team.create({ data: { name: 'A', projects: { create: [
      { projectId: seen.id, role: 'MEMBER' }, { projectId: hidden.id, role: 'ADMIN' },
    ] } } })

    const detail = await getTeam({ id: team.id }, ctx(viewer))

    expect(detail.projects).toEqual([{ id: seen.id, name: 'Website', key: seen.key, role: 'MEMBER' }])
    expect(detail.privateProjects).toBe(1)
    expect(JSON.stringify(detail)).not.toContain('Secret')
  })

  it('answers 404 for a team that does not exist, and 401 to a caller not signed in', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await expect(getTeam({ id: 'missing' }, ctx(viewer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(getTeams(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(getTeam({ id: 'x' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
