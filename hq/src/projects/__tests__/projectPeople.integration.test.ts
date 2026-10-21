/**
 * A project's People tool (every screen reviewed spec §3, People), against the
 * real test DB: its members with name, picture and role here; what waits on
 * each — by the person a run is for — and what they are doing; when they were
 * last here; their tasks by state. Members only; the rest answer as missing.
 * Also the Add picker: everyone still in the organisation, told apart by
 * handle, role and project count.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject, createSession } from '../../test/factories'
import { makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getProjectPeople, getProjectPerson } from '../projectPeopleQueries'
import { listPeopleForProject } from '../memberQueries'

const as = (user: { id: string }) => ({ user }) as any

async function team() {
  const admin = await createUserWithRole('MEMBER', { displayName: 'Ada' })
  const dana = await createUserWithRole('MEMBER', { displayName: 'Dana' })
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.createMany({ data: [
    { projectId: project.id, userId: admin.id, role: 'ADMIN' },
    { projectId: project.id, userId: dana.id, role: 'MEMBER' },
  ] })
  return { admin, dana, project }
}

describe('getProjectPeople @SC-596', () => {
  it('lists the members, admins first, with what waits on each and what they are doing', async () => {
    const { admin, dana, project } = await team()
    const blocked = await makeTask(project.id, { onBehalfOfUserId: dana.id, runState: 'RUN_BLOCKED', runStateReason: 'wants to run a command' })
    await makeTask(project.id, { onBehalfOfUserId: admin.id, status: 'IN_PROGRESS', runState: 'RUN_ACTIVE', assignedAgentId: null })
    await makeTask(project.id, { onBehalfOfUserId: dana.id, status: 'DONE' })

    const view = await getProjectPeople({ projectId: project.id }, as(admin))

    expect(view.canManage).toBe(true)
    expect(view.people.map(p => [p.person.name, p.role])).toEqual([['Ada', 'ADMIN'], ['Dana', 'MEMBER']])
    const danaRow = view.people[1]
    expect(danaRow.now).toMatchObject({ state: 'needsYou', needsYouCount: 1 })
    expect(danaRow.now.lead).toMatchObject({ taskId: blocked.id, reason: 'wants to run a command' })
    expect(danaRow.tasks).toMatchObject({ done: 1, needsYou: 1, total: 2 })
  })

  it('waits on whoever started the run, not the task\'s person', async () => {
    const { admin, dana, project } = await team()
    await makeTask(project.id, { onBehalfOfUserId: admin.id, runOnBehalfOfUserId: dana.id, runState: 'RUN_BLOCKED' })
    const view = await getProjectPeople({ projectId: project.id }, as(dana))
    expect(view.people.find(p => p.person.userId === dana.id)!.now.state).toBe('needsYou')
    expect(view.people.find(p => p.person.userId === admin.id)!.now.state).toBe('idle')
    expect(view.canManage).toBe(false)
  })

  it('says when they were last here from their conversations and comments, or nothing', async () => {
    const { admin, dana, project } = await team()
    await createSession({ userId: dana.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    const view = await getProjectPeople({ projectId: project.id }, as(admin))
    expect(view.people.find(p => p.person.userId === dana.id)!.lastActiveAt).toBeInstanceOf(Date)
    expect(view.people.find(p => p.person.userId === admin.id)!.lastActiveAt).toBeNull()
  })

  it('answers a non-member as if the project did not exist, open or not', async () => {
    const { project } = await team()
    await expect(getProjectPeople({ projectId: project.id }, as(await createUser()))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getProjectPerson @SC-596', () => {
  it('reads one member with their organisation role and when they joined', async () => {
    const { admin, dana, project } = await team()
    const view = await getProjectPerson({ projectId: project.id, userId: dana.id }, as(admin))
    expect(view).toMatchObject({ person: { name: 'Dana' }, role: 'MEMBER', orgRole: 'MEMBER', isMe: false, canManage: true })
  })

  it('answers someone not in the project with 404', async () => {
    const { admin, project } = await team()
    const stranger = await createUser()
    await expect(getProjectPerson({ projectId: project.id, userId: stranger.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('listPeopleForProject @SC-596', () => {
  it('offers everyone still in the organisation, marking who is already here, with role and project count', async () => {
    const { admin, dana, project } = await team()
    const newcomer = await createUserWithRole('MEMBER', { displayName: 'Dana' })
    const left = await createUser({ deactivatedAt: new Date() })

    const people = await listPeopleForProject({ projectId: project.id }, as(admin))
    const byId = new Map(people.map(p => [p.userId, p]))

    expect(byId.get(dana.id)).toMatchObject({ isMember: true, orgRole: 'MEMBER', projectCount: 1 })
    expect(byId.get(newcomer.id)).toMatchObject({ isMember: false, orgRole: 'MEMBER', projectCount: 0 })
    expect(byId.has(left.id)).toBe(false)
  })

  it('is for those who may change the project\'s people', async () => {
    const { dana, project } = await team()
    await expect(listPeopleForProject({ projectId: project.id }, as(dana))).rejects.toMatchObject({ statusCode: 403 })
  })
})
