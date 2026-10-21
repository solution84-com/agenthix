/**
 * An open project is open to join (adr-0099), against the real test DB: it is
 * listed to everyone in the organisation, marked when the person is not in it;
 * before joining they read its preview — what it is, its people and agents,
 * how busy it is — and none of its work. A private project stays unseen. The
 * tools panel's People and Agents rows read the same people and agents.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createProject, createAgent } from '../../test/factories'
import { makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getProjects, getTasks } from '../queries'
import { getProjectPreview, getProjectPanelRows, PANEL_AVATARS } from '../projectPreview'

const as = (user: { id: string }) => ({ user, entities: { Project: prisma.project, Task: prisma.task } }) as any

async function openWithPeople(count: number) {
  const project = await createProject({ accessLevel: 'OPEN', description: 'The public website' })
  const people: Array<{ id: string }> = []
  for (let i = 0; i < count; i++) {
    const person = await createUser({ displayName: `Person ${i}` })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id, role: i === 0 ? 'ADMIN' : 'MEMBER' } })
    people.push(person)
  }
  return { project, people }
}

describe('getProjects @SC-590', () => {
  it('lists every open project and the private ones the person is in, marking which they are in', async () => {
    const me = await createUser()
    const { project: open } = await openWithPeople(1)
    const mine = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: mine.id, userId: me.id } })
    const hidden = await createProject({ accessLevel: 'PRIVATE' })

    const listed = await getProjects(undefined, as(me))
    const byId = new Map(listed.map((p: { id: string; isMember: boolean }) => [p.id, p.isMember]))

    expect(byId.get(open.id)).toBe(false)
    expect(byId.get(mine.id)).toBe(true)
    expect(byId.has(hidden.id)).toBe(false)
  })
})

describe('getProjectPreview @SC-590', () => {
  it('shows a non-member what an open project is, who is in it and how busy it is, and offers Join', async () => {
    const visitor = await createUser()
    const { project, people } = await openWithPeople(2)
    const agent = await createAgent({ name: 'Scout' })
    await prisma.projectAgent.create({ data: { projectId: project.id, agentId: agent.id } })
    await prisma.project.update({ where: { id: project.id }, data: { leadUserId: people[0].id } })
    await makeTask(project.id, { onBehalfOfUserId: people[0].id, runState: 'RUN_ACTIVE' })
    await makeTask(project.id, { onBehalfOfUserId: people[0].id, status: 'DONE' })

    const preview = await getProjectPreview({ projectId: project.id }, as(visitor))

    expect(preview).toMatchObject({
      project: { id: project.id, description: 'The public website', accessLevel: 'OPEN', lead: { userId: people[0].id } },
      isMember: false,
      canJoin: true,
      openTaskCount: 1,
      runningCount: 1,
    })
    expect(preview.people.map(p => p.userId)).toEqual(people.map(p => p.id))
    expect(preview.agents.map(a => a.id)).toEqual([agent.id])
  })

  it('is found by key as well as id', async () => {
    const { project } = await openWithPeople(1)
    const preview = await getProjectPreview({ key: project.key }, as(await createUser()))
    expect(preview.project.id).toBe(project.id)
  })

  it('answers a private project the person is not in as missing, and tells a member they need not join', async () => {
    const outsider = await createUser()
    const member = await createUser()
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: hidden.id, userId: member.id } })

    await expect(getProjectPreview({ projectId: hidden.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404, message: 'Project not found' })
    expect(await getProjectPreview({ projectId: hidden.id }, as(member))).toMatchObject({ isMember: true, canJoin: false })
  })

  it("does not open the project's work to a non-member", async () => {
    const { project } = await openWithPeople(1)
    await expect(getTasks({ projectId: project.id }, as(await createUser()))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('leaves out someone who has left the organisation', async () => {
    const { project, people } = await openWithPeople(2)
    await prisma.user.update({ where: { id: people[1].id }, data: { deactivatedAt: new Date() } })
    const preview = await getProjectPreview({ projectId: project.id }, as(await createUser()))
    expect(preview.people.map(p => p.userId)).toEqual([people[0].id])
  })
})

describe('getProjectPanelRows @SC-590', () => {
  it(`counts the people and agents, with up to ${PANEL_AVATARS} avatars each`, async () => {
    const { project, people } = await openWithPeople(PANEL_AVATARS + 2)
    const rows = await getProjectPanelRows({ projectId: project.id }, as(people[0]))
    expect(rows.people.count).toBe(PANEL_AVATARS + 2)
    expect(rows.people.avatars).toHaveLength(PANEL_AVATARS)
    expect(rows.agents).toEqual({ count: 0, avatars: [] })
  })
})
